export type AirportSummary = {
  iataCode: string;
  city: string;
  name: string;
};

export type FlightPrice = {
  id: string;
  code: string;
  name: string;
  cabinClass: string;
  price: number;
  currency: string;
  availableSeats: number;
  seatSelectionFee?: number;
  seatSelection?: boolean;
  benefits?: string[];
};

export type FlightSeat = {
  id: string;
  rowNumber: number;
  columnLetter: string;
  cabinClass: string;
  type: string;
  isExitRow: boolean;
  status: 'FREE' | 'SELECTED' | 'LOCKED' | 'OCCUPIED';
  allowedForFare: boolean;
  lockedUntil?: string | null;
};

export type FlightSeatMap = {
  aircraft: { id: string; model: string; registration: string; layout: string | null; seatCount: number };
  fare: { id: string; name: string; cabinClass: string; price: number } | null;
  seats: FlightSeat[];
};

export type MobileReservationResult = {
  bookingCode: string;
  bookingId: string;
  expiresAt: string;
  seatsCount: number;
  totalAmount: number;
};

export type MobilePaymentResult = {
  payment: { id: string; status: 'APPROVED' | 'REJECTED'; amount: number; currency: string };
  reused: boolean;
  email: unknown;
};

export type MobileFlight = {
  id: string;
  code: string;
  departureAt: string;
  arrivalAt: string;
  status: string;
  route: {
    durationMinutes: number;
    originAirport: AirportSummary;
    destinationAirport: AirportSummary;
  };
  aircraft: {
    model: string;
    registration: string;
  };
  prices: FlightPrice[];
};

export type FlightSearchResponse = {
  data: MobileFlight[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
};

export type MyBookingFlight = {
  flightCode: string;
  origin: AirportSummary | null;
  destination: AirportSummary | null;
  departureAt: string | null;
  arrivalAt: string | null;
  status: string;
  isReturn: boolean;
  fareName: string | null;
  cabinClass: string;
};

export type MyBooking = {
  bookingCode: string;
  status: string;
  category: 'upcoming' | 'past';
  tripType: string;
  cabinClass: string;
  passengersCount: number;
  totalAmount: number;
  currency: string;
  createdAt: string | null;
  flights: MyBookingFlight[];
  proposedFlight: MyBookingFlight | null;
  proposalReason: string | null;
  passengerResponse: string | null;
};

export type MyBookingsResponse = {
  upcoming: MyBooking[];
  past: MyBooking[];
};
