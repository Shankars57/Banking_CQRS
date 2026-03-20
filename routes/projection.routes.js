import { Router } from "express";
import { rebuildProjectionsController } from "../controllers/projection.controller.js";

const projectionRouter = Router();

projectionRouter.post("/rebuild", rebuildProjectionsController);

export default projectionRouter;
