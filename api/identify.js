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

        // Create form data
        const formData = new FormData();
        formData.append('image', buffer, {
            filename: 'observation.jpg',
            contentType: mimeType || 'image/jpeg'
        });

        // Try the alternative endpoint: /v1/computervision
        // Some versions work better with this URL
        const visionResponse = await fetch('https://api.inaturalist.org/v1/computervision', {
            method: 'POST',
            body: formData,
            headers: {
                ...formData.getHeaders(),
                'User-Agent': 'NatureLens/1.0 (https://naturelens.vercel.app)'
            },
            timeout: 15000 // 15 seconds timeout
        });

        if (!visionResponse.ok) {
            const errorText = await visionResponse.text();
            throw new Error(`iNaturalist vision API failed: ${visionResponse.status} - ${errorText}`);
        }

        const visionData = await visionResponse.json();

        if (!visionData || !visionData.results || visionData.results.length === 0) {
            throw new Error('No identification found. Try a clearer photo.');
        }

        // Get the top result
        const topResult = visionData.results[0];
        const taxon = topResult.taxon;

        if (!taxon) {
            throw new Error('No taxon information found.');
        }

        // Determine icon based on taxonomic rank
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

        // Calculate confidence percentage
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
            all_matches: visionData.results.slice(0, 5).map(r => ({
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
