/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // El formulario de noticia manual sube la foto dentro de la Server
    // Action, y el limite de serie (1 MB) corta cualquier foto de movil
    // antes de que llegue al servidor. Debe ir por encima del tope que
    // valida la accion (MAX_MANUAL_IMAGE_BYTES, 8 MB) para que el que avise
    // sea nuestro mensaje y no un error opaco de Next.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
