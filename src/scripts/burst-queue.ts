import '../bootstrap';
import { produceEvents } from '../tasks/event-producer/event-producer';
import { rebuild } from '../tasks/rebuild/rebuild';
import { processMetadata } from '../tasks/fetch-metadata/fetch-metadata';
import { getTaskName, getWorkerUtils } from '../lib/utils';
import db from '../lib/db';

const tasks: Record<string, (payload: any) => {}> = {
  'event-producer': produceEvents,
  rebuild: rebuild,
  'fetch-metadata': processMetadata,
};

async function run() {
  const taskId = process.argv[2];
  if (!(taskId in tasks)) {
    throw new Error('invalid task id');
  }

  const count = process.argv[3] ? parseInt(process.argv[3], 10) : 1000;
  // the public graphile_worker.jobs view has no payload, so read it from graphile's own table
  const results = await db
    .select('jobs.id', 'jobs.payload')
    .from('graphile_worker._private_jobs as jobs')
    .join('graphile_worker._private_tasks as tasks', 'tasks.id', 'jobs.task_id')
    .where('tasks.identifier', getTaskName(taskId))
    .orderBy('jobs.id', process.argv[4] || 'asc')
    .limit(count);
  const workerUtils = await getWorkerUtils();

  for (let i = 0; i < results.length; i++) {
    const job = results[i];
    console.log(`processing ${i}`);
    console.time(`task-${i}`);
    try {
      await tasks[taskId]!(job.payload);
      await workerUtils.completeJobs([job.id]);
    } catch (err) {
      console.log('err', err);
    }
    console.timeEnd(`task-${i}`);
  }
}

run();
