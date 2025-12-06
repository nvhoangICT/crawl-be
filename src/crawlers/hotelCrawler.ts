import { BaseCrawler } from './baseCrawler';
import { HotelItem } from '../types/crawl';
import { crawlBooking, crawlBookingList, crawlBookingDetail } from '../sites/hotels/booking.site';
import { crawlAgoda } from '../sites/hotels/agoda.site';
import { crawlTraveloka } from '../sites/hotels/traveloka.site';
import { crawlGoogleMapsHotel, crawlGoogleMapsListHotel } from '../sites/hotels/googlemaps.site';
import { crawlGoogleTravel, crawlGoogleTravelList } from '../sites/hotels/googletravel.site';
import { crawlKlook } from '../sites/hotels/klook.site';
import { crawlMytour } from '../sites/hotels/mytour.site';
import { crawlIvivu } from '../sites/hotels/ivivu.site';

export class HotelCrawler extends BaseCrawler<HotelItem> {
  constructor() {
    super({
      booking: crawlBooking,
      agoda: crawlAgoda,
      traveloka: crawlTraveloka,
      googlemaps: crawlGoogleMapsHotel,
      googletravel: crawlGoogleTravel,
      klook: crawlKlook,
      mytour: crawlMytour,
      ivivu: crawlIvivu,
    },
      {
        booking: crawlBookingList,
        googlemaps: crawlGoogleMapsListHotel,
        googletravel: crawlGoogleTravelList,
      },
      {
        booking: crawlBookingDetail,
      });
  }
}
