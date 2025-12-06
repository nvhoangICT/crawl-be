export interface TrainTicketCreateRequest {
  url?: string;
  route?: string;
  averagePrice?: number;
  distance?: number;
  frequency?: number;
  score?: number;
  count?: number;
  legend?: string;
  schedule?: any; // JSON node
  prices?: any; // JSON node
  contact?: any; // JSON node
  crawledAt?: string;
  rating?: any; // JSON node
  lat?: string;
  lng?: string;
  crawledBy?: string;
  crawlerName?: string;
}

// Validation patterns matching backend DTO
const URL_PATTERN = /^(https?|ftp):\/\/[^\s\/$.?#].[^\s]*$/;

function isValidUrl(url?: string): boolean {
  if (!url) return false;
  return URL_PATTERN.test(url.trim());
}

function isValidScore(score?: number): boolean {
  if (score === undefined || score === null) return false;
  return typeof score === 'number' && !isNaN(score) && score >= 0.0 && score <= 5.0;
}

function formatCoordinate(value?: number | null): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value.toString();
}

export type TrainTicketLike = {
  url?: string;
  route?: string;
  averagePrice?: number;
  distance?: number;
  frequency?: number;
  score?: number;
  count?: number;
  legend?: string;
  schedule?: any;
  prices?: any;
  contact?: any;
  crawledAt?: string;
  rating?: any;
  latitude?: number;
  longitude?: number;
};

export function mapTrainTicketLikeToApiRequest(
  trainTicket: TrainTicketLike,
  detailLink?: string,
  crawledBy?: string,
  crawlerName?: string,
): TrainTicketCreateRequest {
  // Validate and clean url
  const url = trainTicket.url?.trim() || detailLink;
  const validUrl = url && isValidUrl(url) ? url : undefined;

  // Validate and clean score
  const score = isValidScore(trainTicket.score) ? trainTicket.score : undefined;

  return {
    url: validUrl || undefined,
    route: trainTicket.route?.trim() || undefined,
    averagePrice: trainTicket.averagePrice !== undefined && trainTicket.averagePrice >= 0 
      ? trainTicket.averagePrice 
      : undefined,
    distance: trainTicket.distance !== undefined && trainTicket.distance >= 0 
      ? trainTicket.distance 
      : undefined,
    frequency: trainTicket.frequency !== undefined && trainTicket.frequency >= 0 
      ? trainTicket.frequency 
      : undefined,
    score: score !== undefined ? score : undefined,
    count: trainTicket.count !== undefined && trainTicket.count >= 0 
      ? trainTicket.count 
      : undefined,
    legend: trainTicket.legend?.trim() || undefined,
    schedule: trainTicket.schedule || undefined,
    prices: trainTicket.prices || undefined,
    contact: trainTicket.contact || undefined,
    crawledAt: trainTicket.crawledAt || undefined,
    rating: trainTicket.rating || undefined,
    lat: formatCoordinate(trainTicket.latitude),
    lng: formatCoordinate(trainTicket.longitude),
    crawledBy: crawledBy || undefined,
    crawlerName: crawlerName || undefined,
  };
}

