"use server";

import { z } from "zod";
import postgres from "postgres";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { AuthError } from "next-auth";

const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });

export async function authenticate(
  prevState: string | undefined,
  formData: FormData
) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials";
        default:
          return "Something went wrong";
      }
    }
    throw error;
  }
}

const formSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: "Please select a customer",
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: "Please enter amount greater than $0" }),
  date: z.string(),
  status: z.enum(["pending", "paid"], {
    invalid_type_error: "Please select an invoice status",
  }),
});

const CreateInvoice = formSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    state?: string[];
  };
  message: string;
};

export async function createInvoice(prevState: State, formData: FormData) {
  const validatedField = CreateInvoice.safeParse({
    customerId: formData.get("customerId"),
    amount: formData.get("amount"),
    status: formData.get("status"),
  });

  if (!validatedField.success) {
    return {
      errors: validatedField?.error.flatten().fieldErrors,
      message: "Missing fields. Fail to Create Invoice",
    };
  }

  const { customerId, amount, status } = validatedField.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split("T")[0];

  try {
    await sql`
    INSERT INTO invoices (customer_id, amount, date, status)
    VALUES (${customerId}, ${amountInCents}, ${date}, ${status})
    `;
  } catch {
    return {
      message: "Database error. Fail to Create Invoice",
    };
  }

  revalidatePath("/dashboard/invoices");
  redirect("/dashboard/invoices");
}

const UpdateInvoice = formSchema.omit({ id: true, date: true });

export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData
) {
  const validatedField = UpdateInvoice.safeParse({
    customerId: formData.get("customerId"),
    amount: formData.get("amount"),
    status: formData.get("status"),
  });

  if (!validatedField.success) {
    return {
      errors: validatedField.error.flatten().fieldErrors,
      message: "Missing fields. Fail to Update Invoice",
    };
  }

  const { customerId, amount, status } = validatedField.data;

  const amountInCents = amount * 100;

  try {
    await sql`
    UPDATE invoices
    SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
    WHERE id = ${id}
    `;
  } catch {
    return {
      message: "Database error. Fail to Update Invoice",
    };
  }

  revalidatePath("/dashboard/invoices");
  redirect("/dashboard/invoices");
}

export async function deleteInvoice(id: string) {
  await sql`
  DELETE FROM invoices WHERE id = ${id}
  `;
  revalidatePath("/dashboard/invoices");
}
