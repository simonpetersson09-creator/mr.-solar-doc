import { COUNTRY_CONNECTION_CONFIGS, GENERIC_CONNECTION_CONFIGS, getConnectionConfig } from "../src/config/connections";
import { connectionCapacityAmount } from "../src/config/connection-capacity";
const rows = (o:any)=>Object.entries(o).map(([code,c]:any)=>({
  code, status:c.status, verified:c.verified, unit:c.capacityInputType, term:c.localTerm,
  svc:c.defaultServiceType, V:c.defaultVoltage, LN:c.defaultLineToNeutralVoltage, Hz:c.defaultFrequencyHz,
  def:c.defaultConnection,
  opts:c.connectionOptions.map((o:any)=>`${o.label}|${o.capacity.serviceType??'-'}@${o.capacity.voltageV??'-'}=${connectionCapacityAmount(o.capacity)}`),
}));
console.log(JSON.stringify({country:rows(COUNTRY_CONNECTION_CONFIGS),generic:rows(GENERIC_CONNECTION_CONFIGS),fallbackZZ:rows({ZZ:getConnectionConfig("ZZ")}),fallbackMX:rows({MX:getConnectionConfig("MX")})},null,1));
