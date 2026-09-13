import { z } from 'zod';
import { fetchPvgisHourly, type ClippingInput } from '@/lib/pvgis-clipping.functions';
import { isNativePlatform } from './native-service';
import { NATIVE_BACKEND_URL } from '@/config/native-backend';
import { NATIVE_PVGIS_PATH } from './native-pvgis';
const schema=z.object({year:z.number().int(),dataSource:z.string(),hourly:z.array(z.object({time:z.string(),powerW:z.number().finite().nonnegative()}))});
export async function getHourlySeries(data: ClippingInput){
 if(!isNativePlatform())return schema.parse(await fetchPvgisHourly({data}));
 const params=new URLSearchParams({mode:'hourly',latitude:String(data.latitude),longitude:String(data.longitude),dcAcRatio:String(data.dcAcRatio)});
 if(data.azimuth!==null)params.set('azimuth',String(data.azimuth));
 if(data.tilt!==null)params.set('tilt',String(data.tilt));
 const response=await fetch(`${NATIVE_BACKEND_URL}${NATIVE_PVGIS_PATH}?${params}`,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error('hourly-unavailable');
 return schema.parse(await response.json());
}
