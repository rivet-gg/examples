import dotenv from "dotenv";
dotenv.config();

import { listen } from "@rivet-gg/plugin-colyseus-server";
import config from "./config";

listen(config);
