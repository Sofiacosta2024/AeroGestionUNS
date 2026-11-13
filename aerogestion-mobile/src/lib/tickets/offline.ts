import * as SecureStore from 'expo-secure-store';
import type { MyBookingTicket } from '@/lib/api/types';

export type OfflineTicket = MyBookingTicket & {
  ownerId: string;
  savedAt: string;
};

const INDEX_PREFIX = 'aerogestion_ticket_index_v1_';
const TICKET_PREFIX = 'aerogestion_ticket_v1_';

function indexKey(ownerId: string) {
  return `${INDEX_PREFIX}${ownerId}`;
}

function ticketKey(ticket: Pick<MyBookingTicket, 'bookingCode' | 'ticketCode'>) {
  return `${TICKET_PREFIX}${ticket.bookingCode}_${ticket.ticketCode}`;
}

export async function getOfflineTickets(ownerId: string): Promise<OfflineTicket[]> {
  const index = await SecureStore.getItemAsync(indexKey(ownerId));
  const keys = index ? (JSON.parse(index) as string[]) : [];
  const values = await Promise.all(keys.map((key) => SecureStore.getItemAsync(key)));
  return values.flatMap((value) => {
    if (!value) return [];
    try {
      const ticket = JSON.parse(value) as OfflineTicket;
      return ticket.ownerId === ownerId ? [ticket] : [];
    } catch {
      return [];
    }
  });
}

export async function getOfflineTicket(
  ownerId: string,
  bookingCode: string,
  ticketCode: string,
): Promise<OfflineTicket | null> {
  const value = await SecureStore.getItemAsync(ticketKey({ bookingCode, ticketCode }));
  if (!value) return null;
  try {
    const ticket = JSON.parse(value) as OfflineTicket;
    return ticket.ownerId === ownerId ? ticket : null;
  } catch {
    return null;
  }
}

export async function syncOfflineTickets(ownerId: string, tickets: MyBookingTicket[]) {
  const indexName = indexKey(ownerId);
  const oldIndex = await SecureStore.getItemAsync(indexName);
  const oldKeys = oldIndex ? (JSON.parse(oldIndex) as string[]) : [];
  const nextKeys = tickets.map(ticketKey);
  const nextSet = new Set(nextKeys);

  await Promise.all(oldKeys.filter((key) => !nextSet.has(key)).map((key) => SecureStore.deleteItemAsync(key)));

  await Promise.all(tickets.map((ticket) => SecureStore.setItemAsync(
    ticketKey(ticket),
    JSON.stringify({ ...ticket, ownerId, savedAt: new Date().toISOString() } satisfies OfflineTicket),
  )));
  await SecureStore.setItemAsync(indexName, JSON.stringify(nextKeys));
}

export async function removeOfflineTicket(
  ownerId: string,
  bookingCode: string,
  ticketCode: string,
) {
  const key = ticketKey({ bookingCode, ticketCode });
  await SecureStore.deleteItemAsync(key);
  const indexName = indexKey(ownerId);
  const oldIndex = await SecureStore.getItemAsync(indexName);
  const keys = oldIndex ? (JSON.parse(oldIndex) as string[]) : [];
  await SecureStore.setItemAsync(indexName, JSON.stringify(keys.filter((item) => item !== key)));
}
