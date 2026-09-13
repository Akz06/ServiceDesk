import { statusFlow } from '../domain/constants';
import type { WorkItemStatus } from '../types';

export function ProgressTracker({ status }: { status: WorkItemStatus }) {
  if (status === 'Cancelled') {
    return (
      <div className="progress-tracker cancelled" role="status" aria-label="Repair progress">
        <strong>Cancelled</strong>
        <span>This repair was cancelled and will not continue through the remaining stages.</span>
      </div>
    );
  }

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
