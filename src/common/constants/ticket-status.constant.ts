import { TicketStatus } from '@prisma/client';

export const TICKET_FORWARD_TRANSITIONS: Partial<Record<TicketStatus, TicketStatus[]>> = {
  [TicketStatus.NEW_TICKET]: [TicketStatus.ASSIGNED],
  [TicketStatus.ASSIGNED]: [TicketStatus.ACCEPTED],
  [TicketStatus.ACCEPTED]: [TicketStatus.TRAVELLING],
  [TicketStatus.TRAVELLING]: [TicketStatus.REACHED_LOCATION],
  [TicketStatus.REACHED_LOCATION]: [TicketStatus.IN_PROGRESS],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.PENDING, TicketStatus.COMPLETED],
  [TicketStatus.PENDING]: [TicketStatus.IN_PROGRESS],
  [TicketStatus.COMPLETED]: [TicketStatus.INVOICE_GENERATED],
  [TicketStatus.INVOICE_GENERATED]: [TicketStatus.TICKET_CLOSED],
};
