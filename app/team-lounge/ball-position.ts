export const loungeBallEntityID = "boardwalk-beach-ball";

export function publishLoungeBallPosition(
  stage: HTMLElement,
  position: Readonly<{ x: number; y: number; rotation?: number }> | undefined,
) {
  if (!position) {
    delete stage.dataset.ballX;
    delete stage.dataset.ballY;
    delete stage.dataset.ballRotation;
    return;
  }
  stage.dataset.ballX = position.x.toFixed(3);
  stage.dataset.ballY = position.y.toFixed(3);
  if (position.rotation !== undefined) {
    stage.dataset.ballRotation = position.rotation.toFixed(3);
  }
}
