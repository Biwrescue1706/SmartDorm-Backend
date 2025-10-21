// src/modules/Users/userRouter.ts
export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

export interface RegisterInput {
  accessToken: string;
  ctitle: string;
  cname: string;
  csurname?: string;
  cphone: string;
  cmumId?: string;
}
