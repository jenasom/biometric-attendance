import os
import numpy as np
import base64
from datetime import datetime
from flask import (
    Flask, 
    jsonify,
    flash,
    request,
    redirect,
    abort
)
from werkzeug.utils import secure_filename
import cv2
from flask_cors import CORS

# Create debug directory if it doesn't exist
DEBUG_DIR = 'debug_images'
if not os.path.exists(DEBUG_DIR):
    os.makedirs(DEBUG_DIR)

# Create fingerprints directory if it doesn't exist
if not os.path.exists('fingerprints'):
    os.makedirs('fingerprints')

UPLOAD_FOLDER = 'fingerprints'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'BMP'}

def preprocess_fingerprint(image, debug=True, idx=None):
    """Enhanced preprocessing pipeline for fingerprint images with adaptive techniques"""
    if image is None:
        print("Error: Input image is None")
        return None
        
    try:
        # Save original for debugging
        if debug and idx is not None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            cv2.imwrite(os.path.join(DEBUG_DIR, f"debug_{idx}_1_original_{timestamp}.jpg"), image)
        
        # Resize with aspect ratio preservation
        max_dim = 512
        height, width = image.shape[:2]
        if height > max_dim or width > max_dim:
            scale = max_dim / float(max(height, width))
            target_size = (int(width * scale), int(height * scale))
            image = cv2.resize(image, target_size, interpolation=cv2.INTER_LANCZOS4)
        
        # Convert to grayscale with enhanced channel mixing if color
        if len(image.shape) == 3:
            # Custom channel mixing for better ridge definition
            b, g, r = cv2.split(image)
            image = cv2.addWeighted(
                cv2.addWeighted(b, 0.299, g, 0.587, 0),
                1.0, r, 0.114, 0
            )
            
        if debug and idx is not None:
            cv2.imwrite(os.path.join(DEBUG_DIR, f"debug_{idx}_2_grayscale_{timestamp}.jpg"), image)
        
        # Advanced denoising with edge preservation
        image = cv2.fastNlMeansDenoising(
            image, 
            None,
            h=10,  # Filter strength
            templateWindowSize=7,
            searchWindowSize=21
        )
        
        # Adaptive histogram equalization with dynamic parameters
        mean_intensity = np.mean(image)
        clip_limit = 3.0 if mean_intensity < 127 else 2.0
        clahe = cv2.createCLAHE(
            clipLimit=clip_limit,
            tileGridSize=(8,8)
        )
        image = clahe.apply(image)
        
        if debug and idx is not None:
            cv2.imwrite(os.path.join(DEBUG_DIR, f"debug_{idx}_3_clahe_{timestamp}.jpg"), image)
        
        # Enhance ridge details
        kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
        image = cv2.filter2D(image, -1, kernel)
        
        # Binary thresholding
        _, image = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        if debug and idx is not None:
            cv2.imwrite(os.path.join(DEBUG_DIR, f"debug_{idx}_4_threshold_{timestamp}.jpg"), image)
        
        # Morphological operations
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
        image = cv2.morphologyEx(image, cv2.MORPH_CLOSE, kernel)
        
        # Thinning (skeletonization)
        from skimage.morphology import skeletonize
        image = skeletonize(image > 0).astype(np.uint8) * 255
        
        if debug and idx is not None:
            cv2.imwrite(os.path.join(DEBUG_DIR, f"debug_{idx}_5_final_{timestamp}.jpg"), image)
        
        return image
        
    except Exception as e:
        print(f"Error in preprocessing: {str(e)}")
        return None

def get_fingerprint_match_score():
    try:
        print("Starting fingerprint matching process...")
        
        # Read images: fingerprint_1 is the newly captured sample; stored_fingerprint.jpeg is the permanent template
        fingerprint1 = cv2.imread("fingerprints/fingerprint_1.jpeg")
        fingerprint2 = cv2.imread("fingerprints/stored_fingerprint.jpeg")

        if fingerprint1 is None or fingerprint2 is None:
            print("Error: Could not read fingerprint images")
            print(f"Sample exists: {os.path.exists('fingerprints/fingerprint_1.jpeg')}")
            print(f"Stored template exists: {os.path.exists('fingerprints/stored_fingerprint.jpeg')}")
            return 0
        
        # Preprocess fingerprints
        fingerprint1 = preprocess_fingerprint(fingerprint1)
        fingerprint2 = preprocess_fingerprint(fingerprint2)
        
        if fingerprint1 is None or fingerprint2 is None:
            print("Error: Failed to preprocess images")
            return 0
            
        # Stage 1: Multi-Scale Feature Detection
        sift = cv2.SIFT_create(
            nfeatures=0,  # Unlimited features
            nOctaveLayers=5,
            contrastThreshold=0.02,  # More sensitive
            edgeThreshold=15,        # Better edge tolerance
            sigma=1.6
        )
        
        # Detect keypoints and compute descriptors at multiple scales
        keypoints_1, des1 = sift.detectAndCompute(fingerprint1, None)
        keypoints_2, des2 = sift.detectAndCompute(fingerprint2, None)
        
        if des1 is None or des2 is None or len(keypoints_1) == 0 or len(keypoints_2) == 0:
            print(f"Error: Insufficient features detected. KP1: {len(keypoints_1)}, KP2: {len(keypoints_2)}")
            return 0
            
        # Stage 2: Enhanced Matching with Multi-step Verification
        FLANN_INDEX_KDTREE = 1
        index_params = dict(algorithm=FLANN_INDEX_KDTREE, trees=5)
        search_params = dict(checks=100)  # Increased number of checks
        flann = cv2.FlannBasedMatcher(index_params, search_params)
        
        # Get k=2 nearest matches for ratio test
        matches = flann.knnMatch(des1, des2, k=2)
        
        # Apply enhanced ratio test with adaptive threshold
        good_matches = []
        min_matches_needed = 8
        ratio_threshold = 0.8  # Start with a more lenient threshold
        
        while ratio_threshold >= 0.65:  # Gradually tighten threshold if needed
            good_matches = []
            for m, n in matches:
                if m.distance < ratio_threshold * n.distance:
                    good_matches.append(m)
                    
            if len(good_matches) >= min_matches_needed:
                break
                
            ratio_threshold -= 0.05  # Try a stricter threshold
                
        initial_matches = good_matches  # For consistency with existing code
        
        # Sort matches by distance
        initial_matches = sorted(initial_matches, key=lambda x: x.distance)
        
        # Stage 3: Geometric Verification
        if len(initial_matches) >= 4:
            src_pts = np.float32([keypoints_1[m.queryIdx].pt for m in initial_matches]).reshape(-1, 1, 2)
            dst_pts = np.float32([keypoints_2[m.trainIdx].pt for m in initial_matches]).reshape(-1, 1, 2)
            
            # Use RANSAC to find the best homography
            H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
            matchesMask = mask.ravel().tolist()
            
            # Filter matches using the homography mask
            good_matches = [m for i, m in enumerate(initial_matches) if matchesMask[i]]
        else:
            good_matches = initial_matches[:10] if len(initial_matches) > 10 else initial_matches
        
        # Stage 4: Multi-factor Scoring
        # 4.1: Quantity Score
        min_keypoints = min(len(keypoints_1), len(keypoints_2))
        if min_keypoints == 0:
            return 0
            
        quantity_score = (len(good_matches) / min_keypoints) * 100
        
        # 4.2: Quality Score (based on match distances)
        if good_matches:
            distances = [m.distance for m in good_matches]
            avg_distance = sum(distances) / len(distances)
            quality_score = max(0, 100 * (1 - avg_distance / 512))
        else:
            quality_score = 0
            
        # 4.3: Distribution Score (how well spread the matches are)
        if len(good_matches) >= 4:
            pts1 = np.float32([keypoints_1[m.queryIdx].pt for m in good_matches])
            distribution_score = cv2.contourArea(np.float32([pts1]))
            distribution_score = min(100, distribution_score / 100)
        else:
            distribution_score = 0
            
        # Stage 5: Advanced Scoring System
        
        # 5.1 Pattern Consistency Score
        if len(good_matches) >= 4:
            pts1 = np.float32([keypoints_1[m.queryIdx].pt for m in good_matches])
            pts2 = np.float32([keypoints_2[m.trainIdx].pt for m in good_matches])
            
            # Calculate ridge pattern consistency
            pattern_diff = np.abs(pts1 - pts2).mean()
            pattern_score = max(0, 100 * (1 - pattern_diff / 100))
        else:
            pattern_score = 0
            
        # 5.2 Local Region Similarity
        local_scores = []
        if len(good_matches) >= 4:
            for match in good_matches[:10]:  # Check top 10 matches
                kp1 = keypoints_1[match.queryIdx]
                kp2 = keypoints_2[match.trainIdx]
                
                # Compare local regions around keypoints
                x1, y1 = int(kp1.pt[0]), int(kp1.pt[1])
                x2, y2 = int(kp2.pt[0]), int(kp2.pt[1])
                
                # Extract local patches (with bounds checking)
                patch_size = 16
                h, w = fingerprint1.shape
                if (x1 >= patch_size and x1 < w - patch_size and 
                    y1 >= patch_size and y1 < h - patch_size and
                    x2 >= patch_size and x2 < w - patch_size and
                    y2 >= patch_size and y2 < h - patch_size):
                    
                    patch1 = fingerprint1[y1-patch_size:y1+patch_size, x1-patch_size:x1+patch_size]
                    patch2 = fingerprint2[y2-patch_size:y2+patch_size, x2-patch_size:x2+patch_size]
                    
                    # Calculate normalized cross-correlation
                    correlation = cv2.matchTemplate(patch1, patch2, cv2.TM_CCORR_NORMED)
                    local_scores.append(float(correlation[0][0]) * 100)
        
        local_similarity_score = np.mean(local_scores) if local_scores else 0
        
        # 5.3 Minutiae Pattern Matching
        minutiae_score = 0
        if len(good_matches) >= 4:
            # Extract potential minutiae points using Harris corner detector
            harris1 = cv2.cornerHarris(fingerprint1, blockSize=2, ksize=3, k=0.04)
            harris2 = cv2.cornerHarris(fingerprint2, blockSize=2, ksize=3, k=0.04)
            
            # Count matching minutiae points
            matched_minutiae = 0
            total_minutiae = 0
            
            for match in good_matches:
                pt1 = keypoints_1[match.queryIdx].pt
                pt2 = keypoints_2[match.trainIdx].pt
                
                x1, y1 = int(pt1[0]), int(pt1[1])
                x2, y2 = int(pt2[0]), int(pt2[1])
                
                if x1 < harris1.shape[1] and y1 < harris1.shape[0] and \
                   x2 < harris2.shape[1] and y2 < harris2.shape[0]:
                    if harris1[y1, x1] > 0.01 * harris1.max() and \
                       harris2[y2, x2] > 0.01 * harris2.max():
                        matched_minutiae += 1
                    total_minutiae += 1
            
            if total_minutiae > 0:
                minutiae_score = (matched_minutiae / total_minutiae) * 100
        
        # Combined weighted score with enhanced factors and minutiae matching
        match_score = (
            quantity_score * 0.20 +         # Quantity of matches
            quality_score * 0.20 +          # Quality of matches
            distribution_score * 0.15 +     # Distribution of matches
            pattern_score * 0.15 +          # Pattern consistency
            local_similarity_score * 0.15 + # Local region similarity
            minutiae_score * 0.15          # Minutiae pattern matching
        )
        
        # Detailed logging with enhanced metrics
        print("\n=== Fingerprint Matching Results ===")
        print(f"Total keypoints: {len(keypoints_1)} / {len(keypoints_2)}")
        print(f"Good matches: {len(good_matches)}")
        print(f"Match scores:")
        print(f"  - Quantity score: {quantity_score:.2f}%")
        print(f"  - Quality score: {quality_score:.2f}%")
        print(f"  - Distribution score: {distribution_score:.2f}%")
        print(f"  - Pattern consistency: {pattern_score:.2f}%")
        print(f"  - Local similarity: {local_similarity_score:.2f}%")
        print(f"Final match score: {match_score:.2f}%")
        print("==================================")
        
        return match_score
        
    except Exception as e:
        print(f"Error during matching: {str(e)}")
        return 0

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def store_fingerprint_images(app, binary_data, idx):
    """Store fingerprint image from base64 data"""
    try:
        # Remove data URL prefix if present
        if ',' in binary_data:
            binary_data = binary_data.split(',')[1]
            
        # Decode base64 string to binary
        image_data = base64.b64decode(binary_data)
        
        # Convert to numpy array for image processing
        nparr = np.frombuffer(image_data, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None:
            print(f"Error: Could not decode image {idx+1}")
            return False
            
        # Save debug image
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        debug_path = os.path.join(DEBUG_DIR, f"debug_original_{idx+1}_{timestamp}.jpg")
        cv2.imwrite(debug_path, image)
        
        # Save processed image: idx 0 -> temp sample fingerprint_1.jpeg, idx 1 -> persistent stored_fingerprint.jpeg
        if idx == 0:
            file_name = f"fingerprint_1.jpeg"
        else:
            file_name = "stored_fingerprint.jpeg"

        file_path = os.path.join(app.config['UPLOAD_FOLDER'], file_name)
        cv2.imwrite(file_path, image)
        
        print(f"Successfully stored fingerprint {idx+1}, shape: {image.shape}")
        return True
        
    except Exception as e:
        print(f"Error storing fingerprint {idx+1}: {str(e)}")
        return False

# Function that create the app 
def create_app(test_config=None ):
    # create and configure the app
    app = Flask(__name__)
    CORS(app)
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    app.config['SECRET_KEY'] = 'dev'

    # Simple route
    @app.route('/')
    def home(): 
        return jsonify({
           "status": "success",
        })

    @app.route('/verify/fingerprint', methods=['GET', 'POST'])
    def verify_fingerprint():
        if request.method == 'POST':
            print("\n=== Starting Fingerprint Verification ===")
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            
            try:
                # Get fingerprint data from request
                data = request.get_json()
                if not data or 'stored' not in data or 'sample' not in data:
                    print("Error: Missing fingerprint data in request")
                    print(f"Request data keys: {data.keys() if data else 'None'}")
                    return jsonify({
                        "status": "error",
                        "message": "Missing fingerprint data",
                        "match_score": 0
                    }), 400
                    
                print(f"Received data - Stored length: {len(data['stored'])}, Sample length: {len(data['sample'])}")

                # Get binary data
                stored_fingerprint = data.get('stored')
                sample_fingerprint = data.get('sample')

                if not sample_fingerprint:
                    return jsonify({
                        "status": "error",
                        "message": "Invalid fingerprint sample data",
                        "match_score": 0
                    }), 400

                # Store sample always; stored template is optional (fallback to existing file)
                store_fingerprint_images(app, sample_fingerprint, 0)

                if stored_fingerprint:
                    # If a stored template is provided in the request, update it
                    store_fingerprint_images(app, stored_fingerprint, 1)

                # Get match score
                match_score = get_fingerprint_match_score()
                
                # Clean up temporary sample only; keep stored_fingerprint.jpeg for future comparisons
                try:
                    sample_path = os.path.join(app.config['UPLOAD_FOLDER'], f"fingerprint_1.jpeg")
                    if os.path.exists(sample_path):
                        os.remove(sample_path)
                except Exception as e:
                    print(f"Warning: Could not remove temporary sample file: {str(e)}")

                # Dynamic thresholding with adaptive base
                base_threshold = 15  # Lowered base threshold
                quality_bonus = 5 if match_score > 40 else 0  # Quality bonus
                quality_threshold = base_threshold + quality_bonus
                
                # Enhanced confidence level determination
                confidence_level = "low"
                if match_score > 50:
                    confidence_level = "high"
                elif match_score > 30:
                    confidence_level = "medium"
                
                return jsonify({
                    "status": "success",
                    "message": "Verification completed successfully",
                    "match_score": match_score,
                    "threshold": quality_threshold,
                    "match_result": match_score > quality_threshold,
                    "confidence_level": confidence_level
                })

            except Exception as e:
                print(f"Error during verification: {str(e)}")
                return jsonify({
                    "status": "error",
                    "message": f"Verification failed: {str(e)}",
                    "match_score": 0
                }), 500
        
        return jsonify({"status": "success"})
     
    return app # do not forget to return the app

APP = create_app()

if __name__ == '__main__':
    APP.run(host='0.0.0.0', port=5050, debug=True)
    # APP.run(debug=True)