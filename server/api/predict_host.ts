import {env} from "std-env";

export default defineEventHandler((_event) => {
    return env.PREDICT_HOST
})
