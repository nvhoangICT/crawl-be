import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';
import { HotelCreateRequest, mapHotelLikeToApiRequest } from './api-mappers/hotel-api.mapper';
import { RestaurantCreateRequest, mapRestaurantItemToApiRequest } from './api-mappers/restaurant-api.mapper';
import { LandmarkCreateRequest, mapLandmarkItemToApiRequest } from './api-mappers/landmark-api.mapper';
import { AttractionCreateRequest, mapAttractionItemToApiRequest } from './api-mappers/attraction-api.mapper';
import { SpaCreateRequest, mapSpaLikeToApiRequest, SpaLike } from './api-mappers/spa-api.mapper';
import { BusCreateRequest, mapBusLikeToApiRequest, BusLike } from './api-mappers/bus-api.mapper';
import { MotorbikeCreateRequest, mapMotorbikeLikeToApiRequest, MotorbikeLike } from './api-mappers/motorbike-api.mapper';
import { TourBusCreateRequest, mapTourBusLikeToApiRequest, TourBusLike } from './api-mappers/tour-bus-api.mapper';
import { TrainTicketCreateRequest, mapTrainTicketLikeToApiRequest, TrainTicketLike } from './api-mappers/train-ticket-api.mapper';
import { MarketplaceCreateRequest, mapMarketplaceLikeToApiRequest, MarketplaceLike } from './api-mappers/marketplace-api.mapper';
import { AirportTransferCreateRequest, mapAirportTransferLikeToApiRequest, AirportTransferLike } from './api-mappers/airport-transfer-api.mapper';
import { HotelItem, LandmarkItem, RestaurantItem, MapsItem, AttractionItem } from '../types/crawl';

export type HotelLike = Partial<HotelItem> & Partial<MapsItem> & {
  name?: string;
  address?: string;
};

interface BaseResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export class AdminApiService {
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.ADMIN_SERVICE_URL || 'http://a238f3f4e2b754227ad9a9c65b31b43e-1948367635.ap-southeast-1.elb.amazonaws.com/api/admin/crawl-data';
    // this.baseUrl = process.env.ADMIN_SERVICE_URL || 'http://localhost:8081/travel';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info('AdminApiService initialized', { baseUrl: this.baseUrl });
  }

  async createHotel(
    hotel: HotelLike,
    detailLink: string,
    sourceSite: string,
    crawledBy?: string,
    crawlerName?: string,
  ): Promise<void> {
    try {
      const request: HotelCreateRequest = mapHotelLikeToApiRequest(
        hotel,
        detailLink,
        sourceSite,
        crawledBy,
        crawlerName,
      );

      logger.info('Calling admin API to create hotel...', { 
        name: request.name, 
        detailLink: request.detailLink 
      });

      // Log debug request
      logger.info('Debug request', { request });

      const response = await this.client.post<BaseResponse<any>>(
        '/api/v1/hotel',
        request,
      );

      if (response.data.success) {
        logger.info('Hotel created successfully via admin API', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      } else {
        logger.warn('Hotel creation returned non-success response', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Unknown error';
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Failed to create hotel via admin API', {
        detailLink,
        error: errorData || errorMessage,
        status: statusCode,
        stack: error.stack,
      });
      
      throw new Error(`Failed to create hotel via admin API: ${errorMessage}${statusCode ? ` (Status: ${statusCode})` : ''}`);
    }
  }

  async createRestaurant(
    restaurant: RestaurantItem,
    detailLink: string,
    crawledBy?: string,
    crawlerName?: string,
  ): Promise<void> {
    try {
      const request: RestaurantCreateRequest = mapRestaurantItemToApiRequest(
        restaurant,
        detailLink,
        crawledBy,
        crawlerName,
      );
      
      logger.info('Calling admin API to create restaurant', { 
        name: request.name, 
        detailLink: request.detailLink 
      });

      const response = await this.client.post<BaseResponse<any>>(
        '/api/v1/restaurant',
        request,
      );

      if (response.data.success) {
        logger.info('Restaurant created successfully via admin API', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      } else {
        logger.warn('Restaurant creation returned non-success response', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Unknown error';
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Failed to create restaurant via admin API', {
        detailLink,
        error: errorData || errorMessage,
        status: statusCode,
        stack: error.stack,
      });
      
      throw new Error(`Failed to create restaurant via admin API: ${errorMessage}${statusCode ? ` (Status: ${statusCode})` : ''}`);
    }
  }

  async createLandmark(
    landmark: LandmarkItem,
    detailLink: string,
    crawledBy?: string,
    crawlerName?: string,
  ): Promise<void> {
    try {
      const request: LandmarkCreateRequest = mapLandmarkItemToApiRequest(
        landmark,
        detailLink,
        crawledBy,
        crawlerName,
      );
      
      logger.info('Calling admin API to create landmark', { 
        name: request.name, 
        detailLink: request.detailLink 
      });

      const response = await this.client.post<BaseResponse<any>>(
        '/api/v1/landmark',
        request,
      );

      if (response.data.success) {
        logger.info('Landmark created successfully via admin API', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      } else {
        logger.warn('Landmark creation returned non-success response', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Unknown error';
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Failed to create landmark via admin API', {
        detailLink,
        error: errorData || errorMessage,
        status: statusCode,
        stack: error.stack,
      });
      
      throw new Error(`Failed to create landmark via admin API: ${errorMessage}${statusCode ? ` (Status: ${statusCode})` : ''}`);
    }
  }

  async createAttraction(
    attraction: AttractionItem,
    detailLink: string,
    crawledBy?: string,
    crawlerName?: string,
  ): Promise<void> {
    try {
      const request: AttractionCreateRequest = mapAttractionItemToApiRequest(
        attraction,
        detailLink,
        crawledBy,
        crawlerName,
      );
      
      logger.info('Calling admin API to create attraction', { 
        name: request.name, 
        detailLink: request.detailLink 
      });

      const response = await this.client.post<BaseResponse<any>>(
        '/api/v1/attraction',
        request,
      );

      if (response.data.success) {
        logger.info('Attraction created successfully via admin API', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      } else {
        logger.warn('Attraction creation returned non-success response', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Unknown error';
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Failed to create attraction via admin API', {
        detailLink,
        error: errorData || errorMessage,
        status: statusCode,
        stack: error.stack,
      });
      
      throw new Error(`Failed to create attraction via admin API: ${errorMessage}${statusCode ? ` (Status: ${statusCode})` : ''}`);
    }
  }

  async createSpa(
    spa: SpaLike,
    detailLink: string,
    crawledBy?: string,
    crawlerName?: string,
  ): Promise<void> {
    try {
      const request: SpaCreateRequest = mapSpaLikeToApiRequest(
        spa,
        detailLink,
        crawledBy,
        crawlerName,
      );
      
      logger.info('Calling admin API to create spa', { 
        name: request.name, 
        detailLink: request.detailLink 
      });

      const response = await this.client.post<BaseResponse<any>>(
        '/api/v1/spa',
        request,
      );

      if (response.data.success) {
        logger.info('Spa created successfully via admin API', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      } else {
        logger.warn('Spa creation returned non-success response', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Unknown error';
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Failed to create spa via admin API', {
        detailLink,
        error: errorData || errorMessage,
        status: statusCode,
        stack: error.stack,
      });
      
      throw new Error(`Failed to create spa via admin API: ${errorMessage}${statusCode ? ` (Status: ${statusCode})` : ''}`);
    }
  }

  async createBus(
    bus: BusLike,
    detailLink?: string,
    crawledBy?: string,
    crawlerName?: string,
  ): Promise<void> {
    try {
      const request: BusCreateRequest = mapBusLikeToApiRequest(
        bus,
        detailLink,
        crawledBy,
        crawlerName,
      );
      
      logger.info('Calling admin API to create bus', { 
        providerName: request.providerName, 
        detailLink: request.sourceUrl 
      });

      const response = await this.client.post<BaseResponse<any>>(
        '/api/v1/bus',
        request,
      );

      if (response.data.success) {
        logger.info('Bus created successfully via admin API', { 
          detailLink: request.sourceUrl,
          response: response.data 
        });
      } else {
        logger.warn('Bus creation returned non-success response', { 
          detailLink: request.sourceUrl,
          response: response.data 
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Unknown error';
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Failed to create bus via admin API', {
        detailLink,
        error: errorData || errorMessage,
        status: statusCode,
        stack: error.stack,
      });
      
      throw new Error(`Failed to create bus via admin API: ${errorMessage}${statusCode ? ` (Status: ${statusCode})` : ''}`);
    }
  }

  async createMotorbike(
    motorbike: MotorbikeLike,
    detailLink: string,
    crawledBy?: string,
    crawlerName?: string,
  ): Promise<void> {
    try {
      const request: MotorbikeCreateRequest = mapMotorbikeLikeToApiRequest(
        motorbike,
        detailLink,
        crawledBy,
        crawlerName,
      );
      
      logger.info('Calling admin API to create motorbike', { 
        location: request.location, 
        detailLink: request.detailLink 
      });

      const response = await this.client.post<BaseResponse<any>>(
        '/api/v1/motorbike',
        request,
      );

      if (response.data.success) {
        logger.info('Motorbike created successfully via admin API', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      } else {
        logger.warn('Motorbike creation returned non-success response', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Unknown error';
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Failed to create motorbike via admin API', {
        detailLink,
        error: errorData || errorMessage,
        status: statusCode,
        stack: error.stack,
      });
      
      throw new Error(`Failed to create motorbike via admin API: ${errorMessage}${statusCode ? ` (Status: ${statusCode})` : ''}`);
    }
  }

  async createTourBus(
    tourBus: TourBusLike,
    detailLink: string,
    crawledBy?: string,
    crawlerName?: string,
  ): Promise<void> {
    try {
      const request: TourBusCreateRequest = mapTourBusLikeToApiRequest(
        tourBus,
        detailLink,
        crawledBy,
        crawlerName,
      );
      
      logger.info('Calling admin API to create tour bus', { 
        title: request.title, 
        detailLink: request.detailLink 
      });

      const response = await this.client.post<BaseResponse<any>>(
        '/api/v1/tour-bus',
        request,
      );

      if (response.data.success) {
        logger.info('Tour bus created successfully via admin API', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      } else {
        logger.warn('Tour bus creation returned non-success response', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Unknown error';
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Failed to create tour bus via admin API', {
        detailLink,
        error: errorData || errorMessage,
        status: statusCode,
        stack: error.stack,
      });
      
      throw new Error(`Failed to create tour bus via admin API: ${errorMessage}${statusCode ? ` (Status: ${statusCode})` : ''}`);
    }
  }

  async createTrainTicket(
    trainTicket: TrainTicketLike,
    detailLink?: string,
    crawledBy?: string,
    crawlerName?: string,
  ): Promise<void> {
    try {
      const request: TrainTicketCreateRequest = mapTrainTicketLikeToApiRequest(
        trainTicket,
        detailLink,
        crawledBy,
        crawlerName,
      );
      
      logger.info('Calling admin API to create train ticket', { 
        route: request.route, 
        url: request.url 
      });

      const response = await this.client.post<BaseResponse<any>>(
        '/api/v1/train-ticket',
        request,
      );

      if (response.data.success) {
        logger.info('Train ticket created successfully via admin API', { 
          url: request.url,
          response: response.data 
        });
      } else {
        logger.warn('Train ticket creation returned non-success response', { 
          url: request.url,
          response: response.data 
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Unknown error';
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Failed to create train ticket via admin API', {
        detailLink,
        error: errorData || errorMessage,
        status: statusCode,
        stack: error.stack,
      });
      
      throw new Error(`Failed to create train ticket via admin API: ${errorMessage}${statusCode ? ` (Status: ${statusCode})` : ''}`);
    }
  }

  async createMarketplace(
    marketplace: MarketplaceLike,
    detailLink: string,
    crawledBy?: string,
    crawlerName?: string,
  ): Promise<void> {
    try {
      const request: MarketplaceCreateRequest = mapMarketplaceLikeToApiRequest(
        marketplace,
        detailLink,
        crawledBy,
        crawlerName,
      );
      
      logger.info('Calling admin API to create marketplace', { 
        name: request.name, 
        detailLink: request.detailLink 
      });

      const response = await this.client.post<BaseResponse<any>>(
        '/api/v1/marketplace',
        request,
      );

      if (response.data.success) {
        logger.info('Marketplace created successfully via admin API', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      } else {
        logger.warn('Marketplace creation returned non-success response', { 
          detailLink: request.detailLink,
          response: response.data 
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Unknown error';
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Failed to create marketplace via admin API', {
        detailLink,
        error: errorData || errorMessage,
        status: statusCode,
        stack: error.stack,
      });
      
      throw new Error(`Failed to create marketplace via admin API: ${errorMessage}${statusCode ? ` (Status: ${statusCode})` : ''}`);
    }
  }

  async createAirportTransfer(
    airportTransfer: AirportTransferLike,
    detailLink?: string,
    crawledBy?: string,
    crawlerName?: string,
  ): Promise<void> {
    try {
      const request: AirportTransferCreateRequest = mapAirportTransferLikeToApiRequest(
        airportTransfer,
        detailLink,
        crawledBy,
        crawlerName,
      );
      
      logger.info('Calling admin API to create airport transfer', { 
        fromLocation: request.fromLocation, 
        toLocation: request.toLocation 
      });

      const response = await this.client.post<BaseResponse<any>>(
        '/api/v1/airport-transfer',
        request,
      );

      if (response.data.success) {
        logger.info('Airport transfer created successfully via admin API', { 
          fromLocation: request.fromLocation,
          toLocation: request.toLocation,
          response: response.data 
        });
      } else {
        logger.warn('Airport transfer creation returned non-success response', { 
          fromLocation: request.fromLocation,
          toLocation: request.toLocation,
          response: response.data 
        });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message 
        || error.response?.data?.error 
        || error.message 
        || 'Unknown error';
      const statusCode = error.response?.status;
      const errorData = error.response?.data;

      logger.error('Failed to create airport transfer via admin API', {
        detailLink,
        error: errorData || errorMessage,
        status: statusCode,
        stack: error.stack,
      });
      
      throw new Error(`Failed to create airport transfer via admin API: ${errorMessage}${statusCode ? ` (Status: ${statusCode})` : ''}`);
    }
  }
}

