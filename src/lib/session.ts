import { cookies } from "next/headers";
import { isValidSessionToken, SESSION_COOKIE_NAME } from "./auth";

/**
 * Las rutas de subida no las cubre el middleware (que solo protege
 * /dashboard) y firman peticiones contra la Admin API de la tienda: sin esto
 * cualquiera podria llenar los Archivos de Shopify. Se comprueba la misma
 * cookie de sesion del panel, para devolver 401 en JSON en vez del redirect
 * a /login que haria el middleware (el navegador espera JSON).
 */
export async function hasDashboardSession(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return isValidSessionToken(token);
}
