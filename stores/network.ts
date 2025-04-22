import { defineStore } from "pinia";

export const useNetworkStore = defineStore("network", {
    state: () => {
        return {
            db_host: "unknown",
            lb_host: "unknown",
            predict_host: "unknown",
            report_host: "unknown",
            trainer_host: "unknown",
        };
    },
    actions: {
        setBackendHosts(db_host: string, lb_host: string, predict_host: string, report_host: string, trainer_host: string) {
            this.db_host = db_host;
            this.lb_host = lb_host;
            this.predict_host = predict_host;
            this.report_host = report_host;
            this.trainer_host = trainer_host;
        },
    },
});