import { computeClippingLoss } from "./src/lib/calc/clipping";

const mockHourly = (peakPower: number) => {
  const hourly = [];
  for (let h = 0; h < 8760; h++) {
    // Simple sine wave for daylight
    const hourOfDay = h % 24;
    let power = 0;
    if (hourOfDay >= 6 && hourOfDay <= 18) {
      power = peakPower * Math.sin(Math.PI * (hourOfDay - 6) / 12);
    }
    hourly.push({ time: `20200101:${hourOfDay}00`, powerW: power * 1000 });
  }
  return hourly;
};

const basePeak = 0.9; // 900W per kWp peak AC
const dcAcRatio = 1.4;

const year1 = computeClippingLoss({
  hourly: mockHourly(basePeak),
  dcAcRatio: dcAcRatio,
  dataSource: "test",
  year: 2020
});

console.log("Year 1 Ratio:", dcAcRatio);
console.log("Year 1 Loss Share:", (year1.annualLossShare * 100).toFixed(2) + "%");

// After 10 years of 0.5% degradation (~5% loss)
const degradation = 0.95;
const year10 = computeClippingLoss({
  hourly: mockHourly(basePeak * degradation),
  dcAcRatio: dcAcRatio,
  dataSource: "test",
  year: 2020
});

console.log("Year 10 (Effective Ratio 1.33) Loss Share:", (year10.annualLossShare * 100).toFixed(2) + "%");

const year25 = computeClippingLoss({
    hourly: mockHourly(basePeak * 0.88), // ~12% degradation
    dcAcRatio: dcAcRatio,
    dataSource: "test",
    year: 2020
});
console.log("Year 25 (Effective Ratio 1.23) Loss Share:", (year25.annualLossShare * 100).toFixed(2) + "%");
