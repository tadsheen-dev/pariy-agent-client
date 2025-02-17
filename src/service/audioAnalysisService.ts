/* eslint-disable prettier/prettier */
export default async function analyzeAudio(formData: FormData): Promise<any> {
  const response = await fetch(process.env.API_AUDIO_ANALYSIS as string, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Analysis failed: ${response.statusText}`);
  }

  return response.json();
} 