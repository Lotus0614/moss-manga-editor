// 生成任务的内存队列 + 事件总线。
// 单机单用户，不需要持久化队列：应用重启时把未完成的标成 interrupted 即可。

import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

const jobs = new Map();

export function createJob(seedInfo = {}) {
  const id = `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const job = {
    id,
    status: 'queued',
    progress: { value: 0, max: 0 },
    promptId: '',
    error: '',
    startedAt: Date.now(),
    ms: 0,
    ...seedInfo,
  };
  jobs.set(id, job);
  emit(job);
  return job;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch);
  emit(job);
  return job;
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 50);
}

/** 只保留最近 200 条，防止内存无限涨 */
export function pruneJobs() {
  if (jobs.size <= 200) return;
  const sorted = [...jobs.values()].sort((a, b) => a.startedAt - b.startedAt);
  for (const job of sorted.slice(0, jobs.size - 200)) jobs.delete(job.id);
}

function emit(job) {
  bus.emit('job', { ...job });
}
