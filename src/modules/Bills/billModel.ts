// src/modules/Bills/billModel.ts
export interface CreateBillInput {
  roomId: string;
  customerId: string;
  month: string;
  wBefore?: number;
  wAfter: number;
  eBefore?: number;
  eAfter: number;
}

export interface BillUpdateInput {
  [key: string]: any;
}

export interface Bill {
  billId: string;
  month: Date;
  total: number;
  rent: number;
  service: number;
  waterCost: number;
  electricCost: number;
  fine: number;
  dueDate: Date;
  status: number;
}
