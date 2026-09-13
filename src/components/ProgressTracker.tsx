import { statusFlow } from '../domain/constants';
import type { WorkItemStatus } from '../types';

export function ProgressTracker({ status }: { status: WorkItemStatus }) {
  const currentIndex = statusFlow.indexOf(status);

  return (
    <ol className="progress-tracker" aria-label="Repair progress">
      {statusFlow.map((value, index) => (
        <li className={index <= currentIndex ? 'done' : ''} key={value}>
          {value}
        </li>
      ))}
    </ol>
  );
}
