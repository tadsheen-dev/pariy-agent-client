/* eslint-disable prettier/prettier */
export default async function login(email: string, password: string): Promise<any> {
  const response = await fetch(process.env.API_LOGIN as string, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Authentication failed');
  }

  return response.json();
} 