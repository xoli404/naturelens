import fetch from 'node-fetch';
import FormData from 'form-data';

export default async function handler(req, res) {
    // Enable CORS
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

        // Convert base64 to buffer
        const buffer = Buffer.from(image, 'base64');

        // Create form data for iNaturalist
        const formData = new FormData();
        formData.append('image', buffer, {
            filename: 'observation.jpg',
            contentType: mimeType || 'image/jpeg'
        });

        // iNaturalist Computer Vision API (NO API KEY NEEDED)
        const response = await fetch('https://api.inaturalist.org/v1/computervision/score_image', {
            method: 'POST',
            body: formData,
            headers: {
                ...formData.getHeaders(),
                'Accept': 'application/json'
            },
            timeout: 20000
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`iNaturalist API failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (!data || !data.results || data.results.length === 0) {
            throw new Error('No identification found. Try a clearer photo.');
        }

        // Get top result
        const topResult = data.results[0];
        const taxon = topResult.taxon;

        if (!taxon) {
            throw new Error('No taxon information found.');
        }

        // Determine icon and type
        let icon = 'fa-leaf';
        let type = 'organism';

        const ancestors = taxon.ancestors || [];
        const ancestorNames = ancestors.map(a => a.name);

        if (ancestorNames.includes('Aves')) {
            icon = 'fa-dove';
            type = 'bird';
        } else if (ancestorNames.includes('Plantae')) {
            icon = 'fa-seedling';
            type = 'plant';
        } else if (ancestorNames.includes('Insecta')) {
            icon = 'fa-bug';
            type = 'insect';
        } else if (ancestorNames.includes('Mammalia')) {
            icon = 'fa-paw';
            type = 'animal';
        } else if (ancestorNames.includes('Amphibia')) {
            icon = 'fa-frog';
            type = 'amphibian';
        } else if (ancestorNames.includes('Reptilia')) {
            icon = 'fa-dragon';
            type = 'reptile';
        } else if (ancestorNames.includes('Fungi')) {
            icon = 'fa-mushroom';
            type = 'fungi';
        }

        // Calculate confidence
        const confidence = topResult.score ? `${Math.round(topResult.score * 100)}%` : 'high';

        // Build response
        const responseData = {
            taxon_name: taxon.name,
            common_name: taxon.preferred_common_name || taxon.name,
            type: type,
            icon: icon,
            confidence: confidence,
            description: taxon.preferred_common_name ?
                `${taxon.preferred_common_name} (${taxon.name})` :
                `Identified as ${taxon.name}`,
            rank: taxon.rank,
            all_matches: data.results.slice(0, 5).map(r => ({
                name: r.taxon.name,
                common_name: r.taxon.preferred_common_name || r.taxon.name,
                score: `${Math.round(r.score * 100)}%`
            }))
        };

        res.status(200).json(responseData);

    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
}
