import { useQuery } from "@tanstack/react-query";
import { searchAddresses, type GeocodeSuggestion } from "@/services/geocoding-service";

export function useAddressSearch(query: string, language: string) {
  return useQuery<GeocodeSuggestion[]>({
    queryKey: ["address-search", query, language],
    enabled: query.trim().length >= 3,
    staleTime: 1000 * 60 * 10,
    queryFn: () => searchAddresses(query, language),
  });
}
