(function (root) {
    'use strict';

    root.INITIAL_BACKUP_DATA = {
        exportType: "agemp-local-finance-backup",
        schemaVersion: 3,
        exportedAt: new Date().toISOString(),
        source: "agemp-local",
        fundsTransactions: [],
        clients: [],
        capitalSources: [
            {
                id: "own-default",
                name: "Capital Próprio",
                type: "own"
            }
        ],
        bankPayments: [],
        historicalInterestAllocations: [],
        suppliers: []
    };
})(typeof window !== 'undefined' ? window : this);
