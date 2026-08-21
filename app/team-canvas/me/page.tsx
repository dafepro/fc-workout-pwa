import { TeamCanvasMe } from "../components/TeamCanvasMe";

export default function TeamCanvasMePage() {
  return (
    <TeamCanvasMe showReviewControls={process.env.NODE_ENV !== "production"} />
  );
}
