import { rebuildProjections } from "../services/projection.service.js";

export const rebuildProjectionsController = async (req, res) => {
  const result = await rebuildProjections();
  res.status(200).json({
    message: "Projections rebuilt successfully",
    ...result,
  });
};
