/**
 * LunchBox serves Hyderabad. New schools, service areas and addresses start in this city, maps open on its centre
 * until something more specific is known, and address search is biased to it. Change these three values, not the
 * screens, to launch in another city.
 */
export const SERVICE_CITY = 'Hyderabad';

/** Hyderabad city centre, by Hussain Sagar. */
export const SERVICE_CITY_CENTER: { readonly lat: number; readonly lng: number } = { lat: 17.385, lng: 78.4867 };

/** Greater Hyderabad, roughly: used to bias address search so short queries resolve inside the city. */
export const SERVICE_CITY_BOUNDS: { readonly south: number; readonly west: number; readonly north: number; readonly east: number } =
  { south: 17.2, west: 78.2, north: 17.6, east: 78.7 };
