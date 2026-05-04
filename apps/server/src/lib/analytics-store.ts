import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { nanoid } from "nanoid";
import { config } from "../config.js";
import { hasPostgres, query } from "./db.js";
import type { AnalysisMode, AnalyticsEventRecord, AnalyticsEventType, AnalyticsOverviewResponse } from "@facemirror/shared";

type AnalyticsEventStatus = AnalyticsEventRecord["status"];

type RecordAnalyticsEventInput = {
  jobId: string;
  feature: AnalysisMode;
  eventType: AnalyticsEventType;
  status?: AnalyticsEventStatus;
  codeId?: string | null;
  durationMs?: number | null;
  errorCode?: string | null;
  createdAt?: string;
};

type ListAnalyticsEventsOptions = {
  from: string;
  to: string;
  feature?: AnalysisMode;
  status?: AnalyticsEventStatus;
  limit?: number;
};

type RedeemCreditSummary = {
  creditsTotal: number;
  creditsRemaining: number;
};

type CountRow = {
  count: number;
};

type FeatureRow = {
  feature: AnalysisMode;
  render_started: number;
  render_completed: number;
  render_failed: number;
  avg_duration_ms: number | null;
};

type DailyRow = {
  date: string;
  render_started: number;
  render_completed: number;
  render_failed: number;
};

let db: DatabaseSync | null = null;

function getDb() {
  if (db) {
    return db;
  }

  fs.mkdirSync(path.dirname(config.analyticsDbFile), { recursive: true });
  db = new DatabaseSync(config.analyticsDbFile);
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      feature TEXT NOT NULL,
      event_type TEXT NOT NULL,
      status TEXT NOT NULL,
      code_id TEXT,
      duration_ms INTEGER,
      error_code TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_job_event ON analytics_events(job_id, event_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_feature ON analytics_events(feature);
  `);
  return db;
}

function defaultStatus(eventType: AnalyticsEventType): AnalyticsEventStatus {
  if (eventType === "render_completed") {
    return "completed";
  }
  if (eventType === "render_failed") {
    return "failed";
  }
  if (eventType === "credit_refunded") {
    return "refunded";
  }
  return "pending";
}

function asCount(row: unknown) {
  return Number((row as CountRow | undefined)?.count ?? 0);
}

function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 50;
  }
  return Math.max(1, Math.min(200, Math.floor(value ?? 50)));
}

function buildRangeWhere(options: { from: string; to: string }) {
  return {
    clause: "created_at >= ? AND created_at <= ?",
    params: [options.from, options.to]
  };
}

export async function recordAnalyticsEvent(input: RecordAnalyticsEventInput) {
  if (hasPostgres()) {
    await query(
      `
        INSERT INTO analytics_events (
          id,
          job_id,
          feature,
          event_type,
          status,
          code_id,
          duration_ms,
          error_code,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        nanoid(16),
        input.jobId,
        input.feature,
        input.eventType,
        input.status ?? defaultStatus(input.eventType),
        input.codeId ?? null,
        input.durationMs ?? null,
        input.errorCode ?? null,
        input.createdAt ?? new Date().toISOString()
      ]
    );
    return;
  }

  const database = getDb();
  database.prepare(`
    INSERT INTO analytics_events (
      id,
      job_id,
      feature,
      event_type,
      status,
      code_id,
      duration_ms,
      error_code,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nanoid(16),
    input.jobId,
    input.feature,
    input.eventType,
    input.status ?? defaultStatus(input.eventType),
    input.codeId ?? null,
    input.durationMs ?? null,
    input.errorCode ?? null,
    input.createdAt ?? new Date().toISOString()
  );
}

export async function getAnalyticsOverview(options: { from: string; to: string; credits: RedeemCreditSummary }): Promise<AnalyticsOverviewResponse> {
  if (hasPostgres()) {
    const countEvent = async (eventType: AnalyticsEventType) => {
      const result = await query<{ count: string }>(
        "SELECT COUNT(*) AS count FROM analytics_events WHERE created_at >= $1 AND created_at <= $2 AND event_type = $3",
        [options.from, options.to, eventType]
      );
      return Number(result.rows[0]?.count ?? 0);
    };

    const [jobsCreated, renderStarted, renderCompleted, renderFailed] = await Promise.all([
      countEvent("job_created"),
      countEvent("render_started"),
      countEvent("render_completed"),
      countEvent("render_failed")
    ]);
    const settled = renderCompleted + renderFailed;
    const successRate = settled > 0 ? renderCompleted / settled : 0;

    const byFeatureResult = await query<{
      feature: AnalysisMode;
      render_started: string;
      render_completed: string;
      render_failed: string;
      avg_duration_ms: string | null;
    }>(
      `
        SELECT
          feature,
          SUM(CASE WHEN event_type = 'render_started' THEN 1 ELSE 0 END) AS render_started,
          SUM(CASE WHEN event_type = 'render_completed' THEN 1 ELSE 0 END) AS render_completed,
          SUM(CASE WHEN event_type = 'render_failed' THEN 1 ELSE 0 END) AS render_failed,
          AVG(CASE WHEN event_type = 'render_completed' THEN duration_ms ELSE NULL END) AS avg_duration_ms
        FROM analytics_events
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY feature
        ORDER BY render_started DESC, feature ASC
      `,
      [options.from, options.to]
    );

    const dailyResult = await query<{
      date: string;
      render_started: string;
      render_completed: string;
      render_failed: string;
    }>(
      `
        SELECT
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
          SUM(CASE WHEN event_type = 'render_started' THEN 1 ELSE 0 END) AS render_started,
          SUM(CASE WHEN event_type = 'render_completed' THEN 1 ELSE 0 END) AS render_completed,
          SUM(CASE WHEN event_type = 'render_failed' THEN 1 ELSE 0 END) AS render_failed
        FROM analytics_events
        WHERE created_at >= $1 AND created_at <= $2
        GROUP BY to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
        ORDER BY date ASC
      `,
      [options.from, options.to]
    );

    return {
      range: {
        from: options.from,
        to: options.to
      },
      totals: {
        jobs_created: jobsCreated,
        render_started: renderStarted,
        render_completed: renderCompleted,
        render_failed: renderFailed,
        success_rate: successRate,
        credits_total: options.credits.creditsTotal,
        credits_remaining: options.credits.creditsRemaining,
        credits_consumed: Math.max(0, options.credits.creditsTotal - options.credits.creditsRemaining)
      },
      by_feature: byFeatureResult.rows.map((row) => ({
        feature: row.feature,
        render_started: Number(row.render_started ?? 0),
        render_completed: Number(row.render_completed ?? 0),
        render_failed: Number(row.render_failed ?? 0),
        avg_duration_ms: row.avg_duration_ms === null ? null : Math.round(Number(row.avg_duration_ms))
      })),
      daily: dailyResult.rows.map((row) => ({
        date: row.date,
        render_started: Number(row.render_started ?? 0),
        render_completed: Number(row.render_completed ?? 0),
        render_failed: Number(row.render_failed ?? 0)
      }))
    };
  }

  const database = getDb();
  const range = buildRangeWhere(options);
  const countEvent = (eventType: AnalyticsEventType) => asCount(database.prepare(`
    SELECT COUNT(*) AS count
    FROM analytics_events
    WHERE ${range.clause} AND event_type = ?
  `).get(...range.params, eventType));

  const jobsCreated = countEvent("job_created");
  const renderStarted = countEvent("render_started");
  const renderCompleted = countEvent("render_completed");
  const renderFailed = countEvent("render_failed");
  const settled = renderCompleted + renderFailed;
  const successRate = settled > 0 ? renderCompleted / settled : 0;

  const byFeature = database.prepare(`
    SELECT
      feature,
      SUM(CASE WHEN event_type = 'render_started' THEN 1 ELSE 0 END) AS render_started,
      SUM(CASE WHEN event_type = 'render_completed' THEN 1 ELSE 0 END) AS render_completed,
      SUM(CASE WHEN event_type = 'render_failed' THEN 1 ELSE 0 END) AS render_failed,
      AVG(CASE WHEN event_type = 'render_completed' THEN duration_ms ELSE NULL END) AS avg_duration_ms
    FROM analytics_events
    WHERE ${range.clause}
    GROUP BY feature
    ORDER BY render_started DESC, feature ASC
  `).all(...range.params).map((row) => {
    const item = row as FeatureRow;
    return {
      feature: item.feature,
      render_started: Number(item.render_started ?? 0),
      render_completed: Number(item.render_completed ?? 0),
      render_failed: Number(item.render_failed ?? 0),
      avg_duration_ms: item.avg_duration_ms === null || item.avg_duration_ms === undefined ? null : Math.round(Number(item.avg_duration_ms))
    };
  });

  const daily = database.prepare(`
    SELECT
      substr(created_at, 1, 10) AS date,
      SUM(CASE WHEN event_type = 'render_started' THEN 1 ELSE 0 END) AS render_started,
      SUM(CASE WHEN event_type = 'render_completed' THEN 1 ELSE 0 END) AS render_completed,
      SUM(CASE WHEN event_type = 'render_failed' THEN 1 ELSE 0 END) AS render_failed
    FROM analytics_events
    WHERE ${range.clause}
    GROUP BY substr(created_at, 1, 10)
    ORDER BY date ASC
  `).all(...range.params).map((row) => {
    const item = row as DailyRow;
    return {
      date: item.date,
      render_started: Number(item.render_started ?? 0),
      render_completed: Number(item.render_completed ?? 0),
      render_failed: Number(item.render_failed ?? 0)
    };
  });

  return {
    range: {
      from: options.from,
      to: options.to
    },
    totals: {
      jobs_created: jobsCreated,
      render_started: renderStarted,
      render_completed: renderCompleted,
      render_failed: renderFailed,
      success_rate: successRate,
      credits_total: options.credits.creditsTotal,
      credits_remaining: options.credits.creditsRemaining,
      credits_consumed: Math.max(0, options.credits.creditsTotal - options.credits.creditsRemaining)
    },
    by_feature: byFeature,
    daily
  };
}

export async function listAnalyticsEvents(options: ListAnalyticsEventsOptions): Promise<AnalyticsEventRecord[]> {
  if (hasPostgres()) {
    const clauses = ["created_at >= $1 AND created_at <= $2"];
    const params: Array<string | number> = [options.from, options.to];

    if (options.feature) {
      params.push(options.feature);
      clauses.push(`feature = $${params.length}`);
    }

    if (options.status) {
      params.push(options.status);
      clauses.push(`status = $${params.length}`);
    }

    params.push(normalizeLimit(options.limit));
    const result = await query<{
      id: string;
      job_id: string;
      feature: AnalysisMode;
      event_type: AnalyticsEventType;
      status: AnalyticsEventStatus;
      code_id: string | null;
      duration_ms: number | null;
      error_code: string | null;
      created_at: Date;
    }>(
      `
        SELECT *
        FROM analytics_events
        WHERE ${clauses.join(" AND ")}
        ORDER BY created_at DESC
        LIMIT $${params.length}
      `,
      params
    );

    return result.rows.map((row) => ({
      id: row.id,
      job_id: row.job_id,
      feature: row.feature,
      event_type: row.event_type,
      status: row.status,
      code_id: row.code_id ?? null,
      duration_ms: row.duration_ms ?? null,
      error_code: row.error_code ?? null,
      created_at: row.created_at.toISOString()
    }));
  }

  const database = getDb();
  const range = buildRangeWhere(options);
  const clauses = [range.clause];
  const params: Array<string | number> = [...range.params];

  if (options.feature) {
    clauses.push("feature = ?");
    params.push(options.feature);
  }

  if (options.status) {
    clauses.push("status = ?");
    params.push(options.status);
  }

  params.push(normalizeLimit(options.limit));

  return database.prepare(`
    SELECT
      id,
      job_id AS job_id,
      feature,
      event_type,
      status,
      code_id,
      duration_ms,
      error_code,
      created_at
    FROM analytics_events
    WHERE ${clauses.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params).map((row) => {
    const item = row as AnalyticsEventRecord;
    return {
      id: item.id,
      job_id: item.job_id,
      feature: item.feature,
      event_type: item.event_type,
      status: item.status,
      code_id: item.code_id ?? null,
      duration_ms: item.duration_ms ?? null,
      error_code: item.error_code ?? null,
      created_at: item.created_at
    };
  });
}
