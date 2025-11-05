const os = require("os");
const config = require("./config");

let requests = {};
let activeUsers = 0;
let authSuccess = 0;
let authFailure = 0;
let latencyMetrics = [];

function getCpuUsagePercentage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage.toFixed(2) * 100;
}

function getMemoryUsagePercentage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory).toFixed(2) * 100;
  return memoryUsage;
}

// Middleware to track requests
function requestTracker(req, res, next) {
  const endpoint = `[${req.method}] ${req.path}`;
  requests[endpoint] = (requests[endpoint] || 0) + 1;
  next();
}

// Middleware to track active users
function setActiveUsers(req, res, next) {
  res.on("finish", () => {
    const statusCode = res.statusCode;
    if (statusCode >= 200 && statusCode < 300) {
      if (req.method === "DELETE") {
        // console.log("Active user should decrease");
        activeUsers -= 1;
      } else {
        // console.log("Active user should increase");
        activeUsers += 1;
      }
      authSuccess += 1;
    } else {
      authFailure += 1;
    }
  });
  // console.log("Active users: ", activeUsers);
  next();
}

// Middleware to track latency
function trackLatency(req, res, next) {
  const startUnixMilli = Date.now();
  res.on("finish", () => {
    const endUnixMilli = Date.now();
    const duration = endUnixMilli - startUnixMilli;
    // console.log("Duration: ", duration);
    latencyMetrics.push(createMetric("latency", duration, "ms", "gauge", "asInt"));
  });
  next();
}

// function pizzaPurchase(isSuccess, latency, price) {

// }

setInterval(() => {
  const metrics = [];

  Object.keys(requests).forEach((endpoint) => {
    metrics.push(
      createMetric("requests", requests[endpoint], "1", "sum", "asInt", {
        endpoint,
      })
    );
  });

  metrics.push(createMetric("active_users", activeUsers, "1", "gauge", "asInt"));

  metrics.push(createMetric("auth_success", authSuccess, "1", "gauge", "asInt"));
  metrics.push(createMetric("auth_failure", authFailure, "1", "gauge", "asInt"));

  const cpuValue = getCpuUsagePercentage();
  metrics.push(createMetric("cpu", cpuValue, "%", "gauge", "asDouble"));

  const memoryValue = getMemoryUsagePercentage();
  metrics.push(createMetric("memory", memoryValue, "%", "gauge", "asDouble"));

  metrics.push(...latencyMetrics);
  latencyMetrics = [];

  sendMetricToGrafana(metrics);
}, 1000);

function createMetric(
  metricName,
  metricValue,
  metricUnit,
  metricType,
  valueType,
  attributes
) {
  attributes = { ...attributes, source: config.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === "sum") {
    metric[metricType].aggregationTemporality =
      "AGGREGATION_TEMPORALITY_CUMULATIVE";
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

function sendMetricToGrafana(metrics) {
  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.metrics.url}`, {
    method: "POST",
    body: JSON.stringify(metric),
    headers: {
      Authorization: `Bearer ${config.metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        response.text().then((text) => {
          console.error(
            `Failed to push metrics data to Grafana: ${text}\n${metric}`
          );
        });
      } else {
        console.log(`Pushed metrics to Grafana`);
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}

module.exports = { requestTracker, setActiveUsers, trackLatency };
