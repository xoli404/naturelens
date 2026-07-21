import FormData from 'form-data';
import fetch from 'node-fetch';

export default async function handler(req, res) {
    // Allow CORS (important for local testing)
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

        // Step 1: Upload image to iNaturalist
        const buffer = Buffer.from(image, 'base64');
        const formData = new FormData();
        formData.append('photo[file]', buffer, {
            filename: 'observation.jpg',
            contentType: mimeType || 'image/jpeg'
        });

        const uploadRes = await fetch('https://www.inaturalist.org/observations.json', {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        if (!uploadRes.ok) {
            const errorText = await uploadRes.text();
            throw new Error(`iNaturalist upload failed: ${uploadRes.status} - ${errorText}`);
        }

        const uploadData = await uploadRes.json();
        const observationId = uploadData.id;

        if (!observationId) {
            throw new Error('No observation ID returned');
        }

        // Step 2: Wait for iNaturalist to process the image
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 3: Get the identification results
        const visionRes = await fetch(`https://api.inaturalist.org/v1/observations/${observationId}`, {
            headers: { 'Accept': 'application/json' }
        });

        if (!visionRes.ok) {
            throw new Error(`iNaturalist vision API failed: ${visionRes.status}`);
        }

        const visionData = await visionRes.json();
        const result = visionData.results?.[0];

        if (!result || !result.taxon) {
            throw new Error('No identification found. Try a clearer photo.');
        }

        const taxon = result.taxon;

        // Determine icon based on taxonomic rank
        let icon = 'fa-leaf';
        if (taxon.ancestors?.some(a => a.name === 'Aves')) icon = 'fa-dove';
        else if (taxon.ancestors?.some(a => a.name === 'Plantae')) icon = 'fa-seedling';
        else if (taxon.ancestors?.some(a => a.name === 'Insecta')) icon = 'fa-bug';
        else if (taxon.ancestors?.some(a => a.name === 'Mammalia')) icon = 'fa-paw';
        else if (taxon.ancestors?.some(a => a.name === 'Amphibia')) icon = 'fa-frog';
        else if (taxon.ancestors?.some(a => a.name === 'Reptilia')) icon = 'fa-dragon';

        // Determine type
        let type = 'organism';
        if (taxon.ancestors?.some(a => a.name === 'Aves')) type = 'bird';
        else if (taxon.ancestors?.some(a => a.name === 'Plantae')) type = 'plant';
        else if (taxon.ancestors?.some(a => a.name === 'Insecta')) type = 'insect';
        else if (taxon.ancestors?.some(a => a.name === 'Mammalia')) type = 'animal';
        else if (taxon.ancestors?.some(a => a.name === 'Amphibia')) type = 'amphibian';
        else if (taxon.ancestors?.some(a => a.name === 'Reptilia')) type = 'reptile';

        const responseData = {
            taxon_name: taxon.name,
            common_name: taxon.preferred_common_name || taxon.name,
            type: type,
            icon: icon,
            confidence: result.vision_score ? `${Math.round(result.vision_score * 100)}%` : 'high',
            description: taxon.preferred_common_name ?
                `${taxon.preferred_common_name} (${taxon.name})` :
                `Identified as ${taxon.name}`,
            observation_id: observationId,
            url: result.uri,
            rank: taxon.rank
        };

        res.status(200).json(responseData);

    } catch (err) {
        console.error('Error:', err);
        res.status(500).json({ error: err.message || 'Internal server error' });
    }
}
