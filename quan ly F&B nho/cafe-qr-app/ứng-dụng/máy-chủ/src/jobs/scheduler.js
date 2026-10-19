// Bộ lập lịch job nền DUY NHẤT (ADR-006, skill advanced-features mục 6): một setInterval 30 giây, giờ theo giờ quán.
// Mỗi lần chạy: khóa trong DB (Settings `job.<name>.running`, hết hạn 30 phút) → không chạy trùng giữa nhiều tiến trình;
// ghi JobRuns (RUNNING → OK/FAILED, SKIPPED khi đang có lần khác chạy). Job phải idempotent.
// JOBS_ENABLED=false (test, E2E) → không tự chạy; vẫn gọi được runJob() (nút "Tính lại", test).
import { query, sql } from '../db.js';
import { notFound } from '../errors.js';
import { vnClock, toMinutes } from '../pricing/pricing.js';
import { vnDayStartUtc } from '../utils/time.js';

const TICK_MS = 30_000;
const LOCK_MINUTES = 30;
const jobs = new Map(); // name → { name, label, everyMinutes?, at?, run }
let timer = null;
const lastRunAt = new Map(); // name → ms (job theo chu kỳ)

/** everyMinutes: chạy mỗi N phút; at: 'HH:MM' giờ quán mỗi ngày. run() trả object ghi vào Info. */
export function registerJob(name, { label, everyMinutes = null, at = null }, run) {
  jobs.set(name, { name, label: label ?? name, everyMinutes, at, run });
}

async function acquire(name) {
  const r = await query(
    `SET XACT_ABORT ON;
     BEGIN TRAN;
     IF NOT EXISTS (SELECT 1 FROM dbo.Settings WITH (UPDLOCK, HOLDLOCK) WHERE SettingKey = @k)
       INSERT dbo.Settings (SettingKey, SettingValue) VALUES (@k, N'');
     UPDATE dbo.Settings SET SettingValue = CONVERT(NVARCHAR(30), SYSUTCDATETIME(), 126), UpdatedAt = SYSUTCDATETIME()
     WHERE SettingKey = @k AND (SettingValue = N'' OR TRY_CONVERT(DATETIME2(0), SettingValue, 126) < DATEADD(MINUTE, -@lock, SYSUTCDATETIME()));
     SELECT @@ROWCOUNT AS Acquired;
     COMMIT;`,
    { k: [sql.NVarChar(50), `job.${name}.running`], lock: [sql.Int, LOCK_MINUTES] },
  );
  return r.recordset[0].Acquired === 1;
}

const release = (name) => query("UPDATE dbo.Settings SET SettingValue = N'' WHERE SettingKey = @k", { k: [sql.NVarChar(50), `job.${name}.running`] });

/** Chạy một job ngay (có khóa + JobRuns). → { name, status, info?, error? } */
export async function runJob(name, { manual = false } = {}) {
  const job = jobs.get(name);
  if (!job) throw notFound(`Không có job "${name}"`);
  if (!(await acquire(name))) {
    await query("INSERT dbo.JobRuns (Name, Status, FinishedAt, Info) VALUES (@n, 'SKIPPED', SYSUTCDATETIME(), N'Đang có lần chạy khác')", {
      n: [sql.VarChar(50), name],
    });
    return { name, status: 'SKIPPED' };
  }
  const started = await query("INSERT dbo.JobRuns (Name, Status, Info) OUTPUT inserted.RunId VALUES (@n, 'RUNNING', @i)", {
    n: [sql.VarChar(50), name],
    i: [sql.NVarChar(400), manual ? 'Chạy thủ công' : null],
  });
  const runId = started.recordset[0].RunId;
  try {
    const info = (await job.run()) ?? {};
    await query("UPDATE dbo.JobRuns SET Status = 'OK', FinishedAt = SYSUTCDATETIME(), Info = @i WHERE RunId = @id", {
      id: [sql.BigInt, runId],
      i: [sql.NVarChar(400), JSON.stringify(info).slice(0, 400)],
    });
    return { name, status: 'OK', info };
  } catch (err) {
    await query("UPDATE dbo.JobRuns SET Status = 'FAILED', FinishedAt = SYSUTCDATETIME(), Error = @e WHERE RunId = @id", {
      id: [sql.BigInt, runId],
      e: [sql.NVarChar(1000), String(err?.message ?? err).slice(0, 1000)],
    }).catch(() => {});
    console.error(`job ${name}:`, err?.message ?? err);
    return { name, status: 'FAILED', error: String(err?.message ?? err) };
  } finally {
    await release(name).catch(() => {});
  }
}

/** Job theo giờ: đã chạy OK sau mốc giờ hôm nay chưa? */
async function ranToday(name, at, now) {
  const mark = new Date(vnDayStartUtc(vnClock(now).date).getTime() + toMinutes(at) * 60_000);
  const r = await query("SELECT TOP 1 1 AS x FROM dbo.JobRuns WHERE Name = @n AND Status IN ('OK', 'RUNNING') AND StartedAt >= @m", {
    n: [sql.VarChar(50), name],
    m: [sql.DateTime2(0), mark],
  });
  return r.recordset.length > 0;
}

async function tick() {
  const now = new Date();
  const { minutes } = vnClock(now);
  for (const job of jobs.values()) {
    try {
      if (job.everyMinutes) {
        const last = lastRunAt.get(job.name) ?? 0;
        if (now.getTime() - last >= job.everyMinutes * 60_000) {
          lastRunAt.set(job.name, now.getTime());
          await runJob(job.name);
        }
      } else if (job.at && minutes >= toMinutes(job.at) && !(await ranToday(job.name, job.at, now))) {
        await runJob(job.name);
      }
    } catch (err) {
      console.error(`scheduler ${job.name}:`, err?.message ?? err);
    }
  }
}

export function startScheduler() {
  if (timer || process.env.JOBS_ENABLED === 'false') return false;
  // Job theo chu kỳ chờ đủ một chu kỳ sau khi khởi động (không chạy dồn lúc mở app)
  for (const j of jobs.values()) if (j.everyMinutes) lastRunAt.set(j.name, Date.now());
  timer = setInterval(() => {
    tick().catch(() => {});
  }, TICK_MS);
  timer.unref?.();
  return true;
}

export function stopScheduler() {
  clearInterval(timer);
  timer = null;
}

/** Trang quản lý: danh sách job + lần chạy gần nhất. */
export async function jobStatus() {
  const r = await query(`
    SELECT j.Name, j.Status, j.StartedAt, j.FinishedAt, j.Info, j.Error
    FROM dbo.JobRuns j
    WHERE j.RunId IN (SELECT MAX(RunId) FROM dbo.JobRuns GROUP BY Name)`);
  const last = new Map(r.recordset.map((x) => [x.Name, x]));
  return [...jobs.values()].map((j) => {
    const l = last.get(j.name);
    return {
      name: j.name,
      label: j.label,
      schedule: j.at ? `Hằng ngày ${j.at}` : `Mỗi ${j.everyMinutes} phút`,
      lastRun: l ? { status: l.Status, startedAt: l.StartedAt, finishedAt: l.FinishedAt, info: l.Info, error: l.Error } : null,
    };
  });
}
