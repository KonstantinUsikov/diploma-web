import { defineStore } from "pinia";

export const useNetworkStore = defineStore("network", {
    state: () => {
        return {
            database_host: "unknown",
            predict_host: "unknown",
            report_host: "unknown"
        };
    },
    actions: {
        setBackendHosts(database_host: string, predict_host: string, report_host: string) {
            this.database_host = database_host;
            this.predict_host = predict_host;
            this.report_host = report_host;
        },
    },
});