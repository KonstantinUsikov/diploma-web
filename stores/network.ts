import { defineStore } from "pinia";

export const useNetworkStore = defineStore("network", {
    state: () => {
        return {
            database_host: "unknown",
            predict_host: "unknown",
            cluster_host: "unknown"
        };
    },
    actions: {
        setBackendHosts(database_host: string, predict_host: string, cluster_host: string) {
            this.database_host = database_host;
            this.predict_host = predict_host;
            this.cluster_host = cluster_host;
        },
    },
});