import { installSimulationWorker } from "@canvas-physics/client/worker-runtime";

import { LoungeBallBehavior } from "./lounge-ball-behavior";
import { LoungeActionBehavior } from "./lounge-action-behavior";

installSimulationWorker(self, [LoungeBallBehavior, LoungeActionBehavior]);
