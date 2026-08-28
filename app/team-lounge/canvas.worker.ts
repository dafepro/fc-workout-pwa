import { installSimulationWorker } from "@canvas-physics/client/worker-runtime";

import { LoungeBallBehavior } from "./lounge-ball-behavior";

installSimulationWorker(self, [LoungeBallBehavior]);
