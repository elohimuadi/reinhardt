import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY, dangerouslyAllowBrowser: true })

export function Reply({ reply }: { reply: string }) {
  return <div dangerouslySetInnerHTML={{ __html: reply }} />
}

export async function ask(prompt: string) {
  const r = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }] })
  localStorage.setItem('access_token', r.id)
  return r.choices[0].message.content
}
