import { visualize } from 'calm-visualizer';
import * as fs from 'node:fs';

export default async function({pattern, output}: {pattern: string, output: string}) {
    const calm = fs.readFileSync(pattern, 'utf-8');
    const svg = await visualize(calm); 
    fs.writeFileSync(output, svg);
}