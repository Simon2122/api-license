const express = require('express');
const fs = require('fs');

const app = express();
const port = 3000;


app.use(express.json());

function addHwidToLicenses(licenses, hwid) {
    let modified = false;
    for (const key in licenses) {
        if (!licenses[key].hasOwnProperty('hwid')) {
            licenses[key].hwid = hwid;
            modified = true;
        }
    }
    if (modified) {
        fs.writeFileSync('licenses.json', JSON.stringify(licenses, null, 2));
    }
}

app.post('/check-license', (req, res) => {
    const { licenseKey } = req.body;
    const ipv4Address = req.ip.replaceAll('::ffff:', '');
    if (!licenseKey) {
        return res.status(400).json({ error: 'License key and HWID are required' });
    }
    fs.readFile('licenses.json', 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal server error' });
        }
        const licenses = JSON.parse(data);
        if (licenses.hasOwnProperty(licenseKey)) {
            const licenseInfo = licenses[licenseKey];
            addHwidToLicenses(licenses, ipv4Address);
            const currentTimestamp = Date.now();
            const expirationTimestamp = licenseInfo.validUntil;
            if (expirationTimestamp === null) {
                return res.json({ success: false, reason: 'Subscription cancelled' });
            }
            if (expirationTimestamp < currentTimestamp) {
                return res.json({ success: false, reason: 'License expired' });
            }
            if (licenseInfo.hwid !== ipv4Address) {
                return res.json({ success: false, reason: 'IP mismatch, Please reset it' });
            }
            return res.json({ success: true });
        } else {
            return res.json({ success: false, reason: 'Invalid license key' });
        }
    });
});
app.post('/remove-hwid', (req, res) => {
    const { discordId } = req.body;
    if (!discordId) {
        return res.status(400).json({ error: 'Discord ID is required' });
    }
    fs.readFile('licenses.json', 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Internal server error' });
        }
        let licenses = JSON.parse(data);
        let modified = false;

        for (const key in licenses) {
            if (licenses[key].discordId === discordId) {
                delete licenses[key].hwid;
                modified = true;
            }
        }
        if (modified) {
            fs.writeFileSync('licenses.json', JSON.stringify(licenses, null, 2));
            return res.json({ success: true, message: 'HWID removed successfully, Please restart your server' });
        } else {
            return res.json({ success: false, message: 'No user found with the provided Discord ID'});
        }
    });
});

app.post('/webhook', (req, res) => {
    const webhookEvent = req.body.event;
    const ipv4Address = req.ip.replaceAll('::ffff:', '');
    if (ipv4Address == "99.81.24.41") {
        // Extract Discord ID and expiration date from the custom fields
        if (webhookEvent == 'order:paid') {
            const customFields = req.body.data.custom_fields;
            const serials = req.body.data.serials;
            const discordId = customFields['Discord ID'];
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + parseInt(31));

            // Read existing licenses from JSON file
            fs.readFile('licenses.json', 'utf8', (err, data) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                // Parse existing licenses 
                let licenses = JSON.parse(data);

                // Create a new license object
                const newLicense = {
                    discordId: discordId,
                    validUntil: expirationDate.getTime() // Store expiration date as timestamp
                };

                // Add new license object with serials as keys
                serials.forEach(serial => {
                    licenses[serial] = newLicense;
                });

                // Write the updated licenses back to the JSON file
                fs.writeFile('licenses.json', JSON.stringify(licenses, null, 2), 'utf8', (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Internal server error' });
                    }
                    console.log('License added successfully');
                });
            });
        } else if (webhookEvent == 'subscription:cancelled' || webhookEvent == "order:cancelled" || webhookEvent == "order:cancelled:product") {
            const discordIdToCancel = req.body.data.custom_fields['Discord ID'];
            // Read existing licenses from JSON file
            fs.readFile('licenses.json', 'utf8', (err, data) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                // Parse existing licenses 
                let licenses = JSON.parse(data);

                // Cancel licenses by setting validUntil to null for the specified Discord ID
                Object.keys(licenses).forEach(serial => {
                    if (licenses[serial].discordId === discordIdToCancel) {
                        licenses[serial].validUntil = null;
                    }
                });

                // Write the updated licenses back to the JSON file
                fs.writeFile('licenses.json', JSON.stringify(licenses, null, 2), 'utf8', (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Internal server error' });
                    }
                    console.log('License cancellation processed successfully');
                });
            });
        } else if (webhookEvent == 'subscription:renewed') {
            const discordIdToRenew = req.body.data.custom_fields['Discord ID'];
            const renewalDuration = 31; // Renewal duration in days

            // Read existing licenses from JSON file
            fs.readFile('licenses.json', 'utf8', (err, data) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Internal server error' });
                }

                // Parse existing licenses 
                let licenses = JSON.parse(data);

                // Renew licenses by updating validUntil for the specified Discord ID
                Object.keys(licenses).forEach(serial => {
                    if (licenses[serial].discordId === discordIdToRenew) {
                        const expirationDate = new Date(licenses[serial].validUntil);
                        expirationDate.setDate(expirationDate.getDate() + renewalDuration);
                        licenses[serial].validUntil = expirationDate.getTime();
                    }
                });

                // Write the updated licenses back to the JSON file
                fs.writeFile('licenses.json', JSON.stringify(licenses, null, 2), 'utf8', (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Internal server error' });
                    }
                    console.log('License renewal processed successfully');
                });
            });
        }
    } else if (ipv4Address != "99.81.24.41"){
        return res.json({message: 'Don\'t even try to fuck up my api buddy'});
    }
        // No need to send a response here
    res.end();
});
// Start the server
app.listen(port, () => {
    console.log(`API succesfuly started and listening at port ${port}`);
});