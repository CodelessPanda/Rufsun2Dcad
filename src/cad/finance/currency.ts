export const DEFAULT_ELECTRICITY_RATE_INR = 8;
export const DEFAULT_INSTALL_COST_PER_WATT_INR = 45;
export const CURRENCY_CODE = "INR";
export const ELECTRICITY_RATE_UNIT = "INR/kWh";
export const INSTALL_COST_UNIT = "INR/W";

export function formatCurrency(value: number) {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${CURRENCY_CODE} ${Math.abs(rounded).toLocaleString("en-IN")}`;
}
