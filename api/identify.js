import fetch from 'node-fetch';
import FormData from 'form-data';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { image, mimeType } = req.body;

        if (!image) {
            return res.status(400).json({ error: 'No image provided' });
        }

        // Your Plant.id API key from admin.kindwise.com
        const PLANT_ID_API_KEY = process.env.PLANT_ID_API_KEY;

        const buffer = Buffer.from(image, 'base64');

        const formData = new FormData();
        formData.append('images', buffer, {
            filename: 'plant.jpg',
            contentType: mimeType || 'image/jpeg'
        });

        const response = await fetch('https://api.plant.id/v2/identify', {
            method: 'POST',
            body: formData,
            headers: {
                ...formData.getHeaders(),
                'Api-Key': PLANT_ID_API_KEY,  // <-- REQUIRED
                'Accept': 'application/json'
            },
            timeout: 20000
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Plant.id API failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (!data.suggestions || data.suggestions.length === 0) {
            throw new Error('No identification found. Try a clearer photo of a plant.');
        }

        const topResult = data.suggestions[0];
        const plantName = topResult.plant_name || 'Unknown plant';
        const scientificName = topResult.plant_details?.scientific_name || plantName;
        const probability = topResult.probability ? `${Math.round(topResult.probability * 100)}%` : 'high';

        const commonNames = topResult.plant_details?.common_names || [];
        const commonNameStr = commonNames.length > 0 ? commonNames.join(', ') : '';

        res.status(200).json({
            taxon_name: scientificName,
            common_name: commonNameStr || plantName,
            type: 'plant',
            icon: 'fa-seedling',
            confidence: probability,
            description: commonNameStr ? 
                `${commonNameStr} (${scientificName})` : 
                `Identified as ${scientificName || plantName}`,
            rank: 'species',
            all_matches: data.suggestions.slice(0, 5).map(s => ({
                name: s.plant_name || 'Unknown',
                common_name: s.plant_details?.common_names?.join(', ') || '',
                score: `${Math.round(s.probability * 100)}%`
            }))
        });

    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
}
