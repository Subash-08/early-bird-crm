import { z } from "zod";

export const panNumber = z.string().trim().toUpperCase()
  .refine((value) => !value || /^[A-Z]{5}\d{4}[A-Z]$/.test(value), "Enter a valid 10-character PAN, or leave it blank.")
  .optional();

export const passportNumber = z.string().trim().toUpperCase()
  .refine((value) => !value || /^[A-Z0-9]{3,24}$/.test(value), "Enter the passport number using 3 to 24 letters or numbers, or leave it blank.")
  .optional();
