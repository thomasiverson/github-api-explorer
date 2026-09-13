export type AssessmentRunControlState =
  | 'running'
  | 'pause_requested'
  | 'paused'
  | 'cancel_requested';

export type AssessmentRunStopReason = 'pause' | 'cancel';

export class AssessmentRunControlError extends Error {
  readonly abortAssessment = true;

  constructor(readonly reason: AssessmentRunStopReason) {
    super(reason === 'pause'
      ? 'Assessment pause requested'
      : 'Assessment cancellation requested');
    this.name = 'AssessmentRunControlError';
  }
}
