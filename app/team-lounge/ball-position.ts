export const loungeBallEntityID = "boardwalk-beach-ball";

export function publishLoungeBallPosition(
  stage: HTMLElement,
  position: Readonly<{ x: number; y: number }> | undefined,
) {
  if (!position) {
    delete stage.dataset.ballX;
    delete stage.dataset.ballY;
    return;
  }
  stage.dataset.ballX = position.x.toFixed(3);
  stage.dataset.ballY = position.y.toFixed(3);
}
