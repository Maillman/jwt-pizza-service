const os = require("os");
const config = require("./config");

let requests = {};
// let latency = 0;

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(2);
}

// Middleware to track requests
export function requestTracker(req, res, next) {
  const endpoint = `[${req.method}] ${req.path}`;
  requests[endpoint] = (requests[endpoint] || 0) + 1;
  next();
}

// function pizzaPurchase(isSuccess, latency, price) {

// }

setInterval(() => {
  const cpuValue = getCpuUsagePercentage();
  sendMetricToGrafana("cpu", cpuValue, "gauge", "%");

  const memoryValue = getMemoryUsagePercentage();
  sendMetricToGrafana("memory", memoryValue, "gauge", "%");

  sendMetricToGrafana("requests", requests, "sum", "1");

  //   latency += Math.floor(Math.random() * 200) + 1;
  //   sendMetricToGrafana("latency", latency, "sum", "ms");
}, 1000);

function sendMetricToGrafana(metricName, metricValue, type, unit) {
  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name: metricName,
                unit: unit,
                [type]: {
                  dataPoints: [
                    {
                      asInt: metricValue,
                      timeUnixNano: Date.now() * 1000000,
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  };

  if (type === "sum") {
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][
      type
    ].aggregationTemporality = "AGGREGATION_TEMPORALITY_CUMULATIVE";
    metric.resourceMetrics[0].scopeMetrics[0].metrics[0][
      type
    ].isMonotonic = true;
  }

  const body = JSON.stringify(metric);
  fetch(`${config.metrics.url}`, {
    method: "POST",
    body: body,
    headers: {
      Authorization: `Bearer ${config.metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        response.text().then((text) => {
          console.error(
            `Failed to push metrics data to Grafana: ${text}\n${body}`
          );
        });
      } else {
        console.log(`Pushed ${metricName}`);
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}
