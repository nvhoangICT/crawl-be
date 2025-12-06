# Crawl Data Service

Service TypeScript/Express dùng Playwright + Crawlee để thu thập dữ liệu từ nhiều trang (news, hotels, restaurant, attraction, landmarks, maps). Service hỗ trợ nhiều loại API endpoints: synchronous, asynchronous (job-based), và streaming (SSE) để phù hợp với các use case khác nhau.

## Stack & Cấu trúc dự án

### Tech Stack
- **TypeScript** - Type-safe development
- **Express** - REST API framework
- **Playwright** - Browser automation
- **Crawlee** - Web scraping framework
- **PostgreSQL** - Database persistence (via `pg`)
- **Zod** - Runtime validation

### Cấu trúc thư mục
```
crawl-data-service/
├── src/
│   ├── app.ts              # Express app setup
│   ├── index.ts            # Entry point
│   ├── controllers/        # API controllers
│   │   └── crawl.controller.ts
│   ├── services/           # Business logic
│   │   ├── crawl.service.ts
│   │   ├── crawlJob.service.ts  # Async job management
│   │   └── persistence.service.ts
│   ├── crawlers/           # Category-specific crawlers
│   │   ├── baseCrawler.ts
│   │   ├── hotelCrawler.ts
│   │   ├── restaurantCrawler.ts
│   │   ├── newsCrawler.ts
│   │   ├── attractionCrawler.ts
│   │   ├── landmarkCrawler.ts
│   │   └── mapsCrawler.ts
│   ├── sites/              # Site-specific handlers
│   │   ├── hotels/        # (agoda, booking, traveloka, googlemaps, ...)
│   │   ├── restaurant/    # (foody, googlemaps, ...)
│   │   ├── news/          # (vnexpress, tuoitre, ...)
│   │   ├── attraction/    # (tripadvisor, ...)
│   │   ├── landmarks/     # (googlemaps, ...)
│   │   └── maps/          # (googlemaps, ...)
│   ├── repositories/      # Database access layer
│   │   ├── hotel.repository.ts
│   │   ├── landmark.repository.ts
│   │   ├── restaurant.repository.ts
│   │   └── mappers/        # Data transformation
│   │       ├── hotel.mapper.ts
│   │       ├── landmark.mapper.ts
│   │       └── restaurant.mapper.ts
│   ├── database/           # Database connection
│   │   └── client.ts
│   ├── routes/             # Express routes
│   │   └── crawl.route.ts
│   ├── types/              # TypeScript types
│   │   ├── crawl.ts
│   │   └── jobs.ts
│   └── utils/              # Utilities
│       ├── logger.ts
│       ├── env.ts
│       └── playwright.ts
├── openapi/                # OpenAPI specification
│   └── openapi.yaml
├── Dockerfile              # Docker configuration
├── package.json
├── tsconfig.json
└── README.md
```

## Cài đặt & Chạy

### Yêu cầu
- Node.js >= 20
- PostgreSQL (nếu sử dụng persistence)
- npm hoặc yarn

### Cài đặt
```bash
npm install
```

### Cấu hình môi trường
Tạo file `.env` trong thư mục gốc:
```ini
# Server
PORT=4000
NODE_ENV=development

# Browser
HEADLESS=true

# Database (optional - chỉ cần nếu muốn lưu dữ liệu)
DATABASE_URL=postgres://user:password@localhost:5432/crawl_db
# hoặc
PGHOST=localhost
PGPORT=5432
PGUSER=myuser
PGPASSWORD=secret
PGDATABASE=crawl_db
PGSSL=false  # true nếu dùng SSL (Heroku, Railway, Neon, ...)
```

### Chạy Development
```bash
npm run dev
```

Service sẽ chạy tại `http://localhost:4000` (hoặc port được cấu hình trong `.env`).

### Build & Production
```bash
# Build TypeScript
npm run build

# Chạy production
npm start
```

### Docker
```bash
# Build image
docker build -t crawl-data-service .

# Chạy container
docker run -p 4000:4000 \
  -e PORT=4000 \
  -e DATABASE_URL=postgres://... \
  crawl-data-service
```

### Scripts hỗ trợ
```bash
# Crawl danh sách khách sạn Traveloka
npm run crawl:traveloka

# Crawl danh sách khách sạn Klook
npm run crawl:klook
# Với `crawl:klook`, có thể set biến `START_URL` hoặc `KLOOK_START_URL` 
# để chỉ định trang listing mặc định (nếu không sẽ dùng URL mẫu Vũng Tàu).
```

## Supported Categories & Sites

### Hotels
- **Traveloka** - Crawl detail và list hotels từ Traveloka
- **Booking.com** - Crawl detail và list hotels từ Booking
- **Agoda** - Crawl detail hotels từ Agoda
- **Google Maps** - Crawl detail và list hotels từ Google Maps
- **Klook** - Crawl hotels từ Klook
- **Mytour** - Crawl hotels từ Mytour
- **Ivivu** - Crawl hotels từ Ivivu

### Restaurants
- **Foody** - Crawl restaurants từ Foody
- **Google Maps** - Crawl detail và list restaurants từ Google Maps
  - Hỗ trợ crawl thông tin chi tiết: tên, địa chỉ, tỉnh, số điện thoại, email, website, hình ảnh, điểm đánh giá, tọa độ
  - Hỗ trợ crawl danh sách restaurants từ trang tìm kiếm Google Maps
  - Tự động thu thập hình ảnh từ canvas element và gallery

### News
- **VnExpress** - Crawl tin tức từ VnExpress
- **Tuổi Trẻ** - Crawl tin tức từ Tuổi Trẻ

### Attractions
- **TripAdvisor** - Crawl điểm tham quan từ TripAdvisor

### Landmarks
- **Google Maps** - Crawl địa danh từ Google Maps

### Maps
- **Google Maps** - Crawl thông tin địa điểm từ Google Maps

## API Endpoints

### 1. Health Check
```http
GET /api/health
```
Kiểm tra trạng thái service và uptime.

### 2. Crawl Detail (Synchronous)
```http
POST /api/crawl
```
Crawl thông tin chi tiết một item (hotel, restaurant, attraction, ...). Endpoint này **block** cho đến khi crawl xong.

**Request:**
```json
{
  "category": "hotels",
  "site": "traveloka",
  "url": "https://www.traveloka.com/...",
  "options": {
    "locale": "vi-VN",
    "timeout": 45000,
    "headless": true
  }
}
```

### 3. Crawl List (Synchronous)
```http
POST /api/crawl/list
```
Crawl danh sách items từ một trang (list hotels, restaurants, ...). Endpoint này **block** cho đến khi crawl xong.

**Request:** (giống như `/api/crawl`)

### 4. Crawl Detail với List Handler
```http
POST /api/crawl/detail
```
Crawl thông tin chi tiết sử dụng detail handler. Endpoint này **block** cho đến khi crawl xong.

**Request:** (giống như `/api/crawl`)

### 5. Async Job-based Crawl
```http
POST /api/crawl/job
```
Tạo một crawl job bất đồng bộ. Trả về `jobId` ngay lập tức, client có thể poll status.

**Request:** (giống như `/api/crawl`)

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "progress": 0,
  "currentStep": "Queued",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 6. Get Job Status
```http
GET /api/crawl/status/:jobId
```
Lấy trạng thái của một crawl job.

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "progress": 45,
  "currentStep": "Extracting data...",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "startedAt": "2024-01-01T00:00:05.000Z"
}
```

### 7. Get Job Result
```http
GET /api/crawl/result/:jobId
```
Lấy kết quả của một crawl job đã hoàn thành.

**Response:**
```json
{
  "name": "Hotel Name",
  "address": "...",
  "rating": "4.5",
  ...
}
```

### 8. Streaming Crawl (SSE)
```http
POST /api/crawl/stream
```
Crawl với Server-Sent Events, trả dữ liệu từng phần real-time. Xem chi tiết ở phần [Streaming API](#streaming-api---trả-dữ-liệu-từng-phần-như-chatgpt).

## Luồng xử lý: từ API đến dữ liệu

1. **HTTP request** – Client gửi request đến một trong các endpoints trên với payload:
   ```json
   {
     "category": "hotels",
     "site": "traveloka",
     "url": "https://www.traveloka.com/...",
     "options": {
       "locale": "vi-VN",
       "timeout": 45000,
       "headless": true
     }
   }
   ```

2. **Controller** (`CrawlController`) dùng Zod validate input, chuẩn hoá URL và trả lỗi 400 nếu sai.

3. **Service layer** (`CrawlService.crawl`) chọn crawler dựa trên `category` (vd: `HotelCrawler`).

4. **Category crawler** (ví dụ `HotelCrawler`) ánh xạ `site` sang handler tương ứng (`traveloka`, `booking`, `agoda`, `googlemaps`, …). Nếu site chưa hỗ trợ -> throw error trả về client.

5. **BaseCrawler** dựng `PlaywrightCrawler`:
   - **Mỗi request tạo một crawler instance mới** để đảm bảo isolation hoàn toàn
   - Giới hạn concurrency ở 1, `maxRequestsPerCrawl=1` vì mỗi API call xử lý đúng một URL
   - Mỗi instance có browser context riêng (cookies, cache, storage tách biệt)
   - `launchContext` cấu hình headless, locale và user-agent
   - `requestHandler` mở trang, `page.goto(url, { waitUntil: 'domcontentloaded' })` và giao `page` cho handler

6. **Site handler** (`src/sites/<category>/<site>.site.ts`) đọc DOM, lấy text/attribute cần thiết và trả `HotelItem`/`NewsItem`/… tương ứng.

7. **Persistence** (nếu có database): Dữ liệu được lưu vào PostgreSQL thông qua `Repository` layer với cơ chế upsert.

8. **Phản hồi** – Controller trả JSON `success: true` cùng dữ liệu và metadata (category, site, url). Nếu lỗi, client nhận thông tin `success: false` + thông điệp + danh sách category hỗ trợ.

## Database Persistence

Service hỗ trợ lưu dữ liệu crawl vào PostgreSQL cho các category `hotels`, `landmarks`, và `restaurant`. Dữ liệu được lưu tự động khi crawl thành công (nếu database được cấu hình).

### Hotels Table
Category `hotels` (và `maps` nếu crawl Google Maps chi tiết khách sạn) sẽ **được lưu thẳng vào bảng `hotels`** bằng cơ chế upsert dựa trên `detail_link` (URL đang crawl). Nếu đã tồn tại dòng trùng `detail_link`, dữ liệu mới sẽ cập nhật lại các cột chính.

**Schema:**
```sql
CREATE TABLE hotels (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  accommodation_type VARCHAR(100),
  rating VARCHAR(50),
  address VARCHAR(500),
  province VARCHAR(100),
  phone VARCHAR(50),
  price VARCHAR(50),
  website TEXT,
  image_url TEXT,
  detail_link TEXT UNIQUE,
  services TEXT,
  images JSONB,
  scores VARCHAR(50),
  rating_value NUMERIC(4, 2),
  description TEXT,
  crawled_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_hotels_detail_link ON hotels(detail_link);
```

### Landmarks Table
Category `landmarks` sẽ được lưu vào bảng `landmarks` với cơ chế upsert tương tự.

**Schema:**
```sql
CREATE TABLE landmarks (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address VARCHAR(500),
  province VARCHAR(100),
  phone VARCHAR(50),
  mobile_phone VARCHAR(50),
  email VARCHAR(255),
  website TEXT,
  image_url TEXT,
  detail_link TEXT UNIQUE,
  lat NUMERIC(10, 8),
  lng NUMERIC(11, 8),
  crawled_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_landmarks_detail_link ON landmarks(detail_link);
```

### Restaurants Table
Category `restaurant` sẽ được lưu vào bảng `restaurants` với cơ chế upsert tương tự.

**Schema:**
```sql
CREATE TABLE restaurants (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  province TEXT,
  phone TEXT,
  mobile_phone TEXT,
  email TEXT,
  website TEXT,
  image_url TEXT,
  detail_link TEXT UNIQUE,
  crawled_at TIMESTAMP,
  score NUMERIC(3, 1),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  lat VARCHAR,
  lng VARCHAR
);

CREATE INDEX idx_restaurants_detail_link ON restaurants(detail_link);
```

### Cấu hình Database
Đặt biến môi trường trong `.env`:
```ini
# Option 1: Connection string
DATABASE_URL=postgres://user:password@localhost:5432/crawl_db

# Option 2: Individual parameters
PGHOST=localhost
PGPORT=5432
PGUSER=myuser
PGPASSWORD=secret
PGDATABASE=crawl_db
PGSSL=false  # true nếu dùng SSL (Heroku, Railway, Neon, ...)
```

**Lưu ý**: Nếu không cấu hình database, service vẫn hoạt động bình thường nhưng sẽ không lưu dữ liệu vào database.

### Repository Layer
- `HotelRepository` (`src/repositories/hotel.repository.ts`) - Xử lý CRUD cho hotels
- `LandmarkRepository` (`src/repositories/landmark.repository.ts`) - Xử lý CRUD cho landmarks
- `RestaurantRepository` (`src/repositories/restaurant.repository.ts`) - Xử lý CRUD cho restaurants
- Mappers (`src/repositories/mappers/`) - Transform data từ crawl result sang database row

## Streaming API - Trả dữ liệu từng phần như ChatGPT

Service hỗ trợ **Server-Sent Events (SSE)** để trả dữ liệu incrementally, giúp:
- **Giảm thời gian chờ**: Client nhận dữ liệu ngay khi có, không cần đợi toàn bộ crawl xong
- **Cải thiện UX**: Hiển thị progress và dữ liệu real-time
- **Tối ưu thời gian**: Sử dụng `domcontentloaded` thay vì `networkidle` (tiết kiệm 2-5 giây)

### Sử dụng Streaming Endpoint

**Endpoint**: `POST /api/crawl/stream`

**Request body** (giống endpoint thường):
```json
{
  "category": "hotels",
  "site": "traveloka",
  "url": "https://www.traveloka.com/...",
  "options": {
    "timeout": 30000,
    "headless": true
  }
}
```

**Response** (Server-Sent Events):
```
data: {"type":"progress","message":"Starting crawl for traveloka...","progress":0,"requestId":"550e8400-e29b-41d4-a716-446655440000","timestamp":1704067200000}

data: {"type":"progress","message":"Loading page...","progress":10,"requestId":"550e8400-e29b-41d4-a716-446655440000","timestamp":1704067201000}

data: {"type":"progress","message":"Page loaded, extracting data...","progress":30,"requestId":"550e8400-e29b-41d4-a716-446655440000","timestamp":1704067202000}

data: {"type":"data","data":{"name":"Hotel Name","address":"..."},"requestId":"550e8400-e29b-41d4-a716-446655440000","timestamp":1704067203000}

data: {"type":"progress","message":"Crawl completed","progress":100,"requestId":"550e8400-e29b-41d4-a716-446655440000","timestamp":1704067204000}

data: {"type":"complete","totalItems":1,"duration":5234,"requestId":"550e8400-e29b-41d4-a716-446655440000","timestamp":1704067205000}
```

**Quan trọng**: Mỗi event đều có `requestId` và `timestamp` để:
- **Phân biệt events** từ các request khác nhau khi có nhiều người dùng gọi API đồng thời
- **Tracking và debugging** dễ dàng
- **Tránh xung đột dữ liệu** giữa các stream events

### Ví dụ sử dụng với JavaScript/TypeScript

```typescript
const response = await fetch('http://localhost:4000/api/crawl/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    category: 'hotels',
    site: 'traveloka',
    url: 'https://www.traveloka.com/...',
  }),
});

// Lưu requestId từ event đầu tiên để filter events
let myRequestId: string | null = null;

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader!.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const event = JSON.parse(line.slice(6));
      
      // Lưu requestId từ event đầu tiên
      if (!myRequestId && event.requestId) {
        myRequestId = event.requestId;
        console.log(`Started request: ${myRequestId}`);
      }
      
      // Chỉ xử lý events từ request của mình (quan trọng khi có nhiều requests đồng thời)
      if (event.requestId === myRequestId) {
        switch (event.type) {
          case 'progress':
            console.log(`[${event.requestId}] Progress: ${event.progress}% - ${event.message}`);
            // Cập nhật UI progress bar
            break;
          case 'data':
            console.log('Received data:', event.data);
            // Hiển thị dữ liệu ngay lập tức
            break;
          case 'complete':
            console.log(`[${event.requestId}] Completed in ${event.duration}ms`);
            // Đóng connection hoặc reset UI
            break;
          case 'error':
            console.error(`[${event.requestId}] Error:`, event.error);
            // Hiển thị lỗi cho user
            break;
        }
      } else {
        // Event từ request khác - có thể log hoặc ignore
        console.debug(`Ignoring event from other request: ${event.requestId}`);
      }
    }
  }
}
```

### Xử lý Multiple Concurrent Streams

Khi có nhiều requests đồng thời, mỗi event có `requestId` riêng để phân biệt:

```typescript
// Map để lưu trữ data cho từng request
const requestDataMap = new Map<string, any[]>();

// Khi nhận event
if (line.startsWith('data: ')) {
  const event = JSON.parse(line.slice(6));
  const requestId = event.requestId;
  
  if (event.type === 'data') {
    // Lưu data theo requestId
    if (!requestDataMap.has(requestId)) {
      requestDataMap.set(requestId, []);
    }
    requestDataMap.get(requestId)!.push(event.data);
  }
  
  if (event.type === 'complete') {
    // Xử lý data hoàn chỉnh cho request này
    const data = requestDataMap.get(requestId);
    console.log(`Request ${requestId} completed with ${data?.length} items`);
    requestDataMap.delete(requestId);
  }
}
```

### Ví dụ với cURL

```bash
curl -N -X POST http://localhost:4000/api/crawl/stream \
  -H 'Content-Type: application/json' \
  -d '{
    "category": "hotels",
    "site": "traveloka",
    "url": "https://www.traveloka.com/..."
  }'
```

**Lưu ý**: Mỗi event trong response sẽ có `requestId` và `timestamp` để phân biệt events từ các request khác nhau.

## Tối ưu đã triển khai
1. ✅ **Smart wait strategy**: Thay `networkidle` bằng `domcontentloaded` + smart wait (tiết kiệm 2-5 giây)
2. ✅ **Streaming response**: Trả dữ liệu từng phần qua SSE, giống ChatGPT
3. ✅ **Progress tracking**: Client nhận progress updates real-time
4. ✅ **Reduced timeouts**: Giảm timeout cho selectors từ 5s xuống 3s khi có thể
5. ✅ **Request isolation**: Mỗi request có browser context và storage riêng, đảm bảo không xung đột dữ liệu
6. ✅ **Concurrent support**: Hỗ trợ nhiều người dùng gọi API đồng thời mà không ảnh hưởng lẫn nhau
7. ✅ **Request ID trong stream events**: Mỗi stream event có `requestId` và `timestamp` để phân biệt events từ các request khác nhau, tránh xung đột khi có nhiều requests đồng thời

## Hỗ trợ Concurrent Requests - Nhiều người dùng cùng lúc

Service được thiết kế để **hỗ trợ nhiều người dùng gọi API crawl đồng thời** mà không gây xung đột dữ liệu:

### Cơ chế Isolation (Phân biệt dữ liệu)

Mỗi request crawl được xử lý **hoàn toàn độc lập** với các request khác:

1. **Browser Context riêng biệt**: Mỗi request tạo một `PlaywrightCrawler` instance mới với browser context riêng, đảm bảo:
   - Cookies, cache, localStorage riêng biệt
   - Không ảnh hưởng lẫn nhau giữa các request
   - Mỗi request có session riêng

2. **Storage Directory riêng**: Crawlee tự động quản lý storage directory riêng cho mỗi crawler instance:
   - Request queue riêng biệt
   - Dữ liệu crawl được lưu tách biệt
   - Không có xung đột dữ liệu giữa các request

3. **Request ID tracking**: Mỗi request được gán một UUID duy nhất để:
   - Theo dõi và log riêng biệt
   - Debug dễ dàng khi có vấn đề
   - Phân biệt request trong logs

4. **Stateless design**: Service không lưu trữ state chung giữa các request:
   - Mỗi request độc lập hoàn toàn
   - Không có shared state có thể gây conflict
   - Dễ dàng scale horizontal

### Ví dụ Concurrent Requests

```bash
# Request 1 - User A
curl -X POST http://localhost:4000/api/crawl \
  -H 'Content-Type: application/json' \
  -d '{"category": "hotels", "site": "traveloka", "url": "https://..."}'

# Request 2 - User B (cùng lúc)
curl -X POST http://localhost:4000/api/crawl \
  -H 'Content-Type: application/json' \
  -d '{"category": "hotels", "site": "booking", "url": "https://..."}'

# Request 3 - User C (cùng lúc)
curl -X POST http://localhost:4000/api/crawl/stream \
  -H 'Content-Type: application/json' \
  -d '{"category": "news", "site": "vnexpress", "url": "https://..."}'
```

Tất cả 3 requests trên có thể chạy **đồng thời** mà không ảnh hưởng lẫn nhau. Mỗi request có:
- Browser instance riêng
- Storage riêng
- Request ID riêng
- Response stream riêng (cho streaming endpoint)

## Giới hạn và Best Practices

### Giới hạn Concurrent Requests

Service không có giới hạn cứng về số lượng concurrent requests, nhưng cần lưu ý:

1. **Tài nguyên hệ thống**: Mỗi request tạo một browser instance riêng, tiêu tốn:
   - RAM: ~100-200MB mỗi browser instance
   - CPU: Phụ thuộc vào số lượng request đồng thời
   - Disk: Storage directory tạm thời cho mỗi request

2. **Khuyến nghị**:
   - **Development**: 5-10 concurrent requests
   - **Production**: 20-50 concurrent requests (tùy server specs)
   - Sử dụng load balancer và multiple instances để scale

3. **Rate limiting** (nếu cần):
   - Có thể thêm middleware rate limiting (vd: `express-rate-limit`)
   - Giới hạn theo IP hoặc API key
   - Bảo vệ server khỏi abuse

### Best Practices

1. **Sử dụng streaming endpoint** cho UX tốt hơn:
   - Client nhận dữ liệu ngay khi có
   - Hiển thị progress real-time
   - Giảm perceived latency

2. **Timeout hợp lý**:
   - Default: 30 giây
   - Có thể tăng cho trang web chậm
   - Không nên quá dài (tránh block resources)

3. **Error handling**:
   - Luôn xử lý lỗi từ API
   - Retry logic cho lỗi tạm thời
   - Logging để debug

4. **Monitoring**:
   - Theo dõi số lượng concurrent requests
   - Monitor memory và CPU usage
   - Alert khi có vấn đề

## Ý tưởng tối ưu thêm (chưa triển khai)
1. **Tăng throughput bằng queue**: Tái sử dụng crawler instance/queue với `RequestQueue` + worker pool
2. **Warm browser context**: Giữ Chromium instance mở, chỉ tạo page mới (giảm ~1‑2 giây)
3. **Song song hoá**: Nâng `maxConcurrency` cho nhiều URL đồng thời
4. **Cache layer**: Redis cache cho URL trùng lặp
5. **Stabilize selectors**: Gom logic tìm DOM chung vào helper

## Kiểm thử nhanh

### Health Check
```bash
curl http://localhost:4000/api/health
```

### Crawl Detail (Synchronous)
```bash
curl -X POST http://localhost:4000/api/crawl \
  -H 'Content-Type: application/json' \
  -d '{
    "category": "hotels",
    "site": "traveloka",
    "url": "https://www.traveloka.com/..."
  }'
```

### Crawl List
```bash
curl -X POST http://localhost:4000/api/crawl/list \
  -H 'Content-Type: application/json' \
  -d '{
    "category": "hotels",
    "site": "traveloka",
    "url": "https://www.traveloka.com/hotels",
    "options": {
      "maxPages": 5
    }
  }'
```

### Async Job-based Crawl
```bash
# Tạo job
JOB_ID=$(curl -X POST http://localhost:4000/api/crawl/job \
  -H 'Content-Type: application/json' \
  -d '{
    "category": "hotels",
    "site": "traveloka",
    "url": "https://www.traveloka.com/..."
  }' | jq -r '.jobId')

# Kiểm tra status
curl http://localhost:4000/api/crawl/status/$JOB_ID

# Lấy kết quả (khi job done)
curl http://localhost:4000/api/crawl/result/$JOB_ID
```

### Streaming endpoint (SSE)
```bash
curl -N -X POST http://localhost:4000/api/crawl/stream \
  -H 'Content-Type: application/json' \
  -d '{
    "category": "hotels",
    "site": "traveloka",
    "url": "https://www.traveloka.com/..."
  }'
```

Theo dõi log (`src/utils/logger.ts`) để biết khi nào page điều hướng và khi crawl xong.

## OpenAPI Specification

Service có OpenAPI specification tại `openapi/openapi.yaml` mô tả đầy đủ:
- Tất cả API endpoints
- Request/Response schemas
- Examples và descriptions

Có thể sử dụng để:
- Generate client SDKs
- API documentation (Swagger UI)
- Testing và validation

## Development

### Project Structure
Xem phần [Stack & Cấu trúc dự án](#stack--cấu-trúc-dự-án) để hiểu rõ cấu trúc code.

### Git Ignore
File `.gitignore` đã được cấu hình để ignore:
- `node_modules/`, build outputs (`dist/`)
- Environment files (`.env*`)
- Crawlee storage (`storage/`)
- Playwright artifacts (`.playwright/`, `test-results/`)
- IDE files, logs, temporary files
- Sensitive data (secrets, credentials)

### Logging
Service sử dụng custom logger (`src/utils/logger.ts`) với:
- INFO level cho business operations
- ERROR level cho exceptions
- Structured logging với context

### Error Handling
- Validation errors: Zod schema validation trả về 400 với chi tiết
- Crawl errors: Được catch và trả về với message rõ ràng
- Database errors: Được log và re-throw với context

## Mở rộng

### Thêm Site mới
1. Tạo handler trong `src/sites/<category>/newsite.site.ts`
2. Export function với signature: `async function crawlNewsite(page: Page, url: string, options?: CrawlOptions, onStream?: StreamCallback): Promise<CategoryItem>`
3. Import vào crawler tương ứng (vd: `HotelCrawler`, `RestaurantCrawler`)
4. Map key trong constructor của crawler

**Ví dụ:**
```typescript
// src/sites/hotels/newsite.site.ts
import { Page } from 'playwright';
import { HotelItem, CrawlOptions, StreamCallback } from '../../types/crawl';

export async function crawlNewsite(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<HotelItem>
): Promise<HotelItem> {
  // Implementation
  const result = {
    name: await page.textContent('h1'),
    // ...
  };
  
  onStream?.({
    type: 'data',
    data: result,
  });
  
  return result;
}

// src/crawlers/hotelCrawler.ts
import { crawlNewsite } from '../sites/hotels/newsite.site';

constructor() {
  super({
    // ...
    newsite: crawlNewsite,
  });
}
```

**Ví dụ với List Handler:**
```typescript
// src/sites/restaurant/newsite.site.ts
export async function crawlNewsiteList(
  page: Page,
  url: string,
  options?: CrawlOptions,
  onStream?: StreamCallback<RestaurantItem>
): Promise<RestaurantItem[]> {
  // Implementation for list crawling
  const results: RestaurantItem[] = [];
  // ... crawl logic
  return results;
}

// src/crawlers/restaurantCrawler.ts
constructor() {
  super(
    {
      newsite: crawlNewsite,
    },
    {
      newsite: crawlNewsiteList, // List handler
    }
  );
}
```

### Thêm Category mới
1. Tạo crawler extends `BaseCrawler` trong `src/crawlers/`
2. Đăng ký vào `CrawlService.crawlers` map
3. Cập nhật Zod schema trong `CrawlController`
4. Tạo type definition trong `src/types/crawl.ts`
5. (Optional) Tạo repository và mapper nếu cần persistence

### Thêm Repository cho Category mới
1. Tạo mapper trong `src/repositories/mappers/`
2. Tạo repository trong `src/repositories/`
3. Implement upsert logic
4. Integrate vào `PersistenceService`

## License

[Thêm license nếu có]
