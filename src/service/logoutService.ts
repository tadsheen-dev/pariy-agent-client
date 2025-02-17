/* eslint-disable prettier/prettier */
export default async function logout(
  agentId: string,
  workTime: number,
): Promise<void> {
  const response = await fetch(process.env.API_LOGOUT as string, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ agent_id: agentId, workTime }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Logout failed');
  }
} 