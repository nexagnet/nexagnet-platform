# Bắt đầu nhanh

> **Tài liệu demo/legacy** — xem [“Giới thiệu hệ thống cho lãnh đạo”](gioi-thieu-he-thong-cho-lanh-dao.md) để biết luồng hiện tại.
> Kế toán và lái xe dùng [Hướng dẫn cho kế toán](huong-dan-ke-toan.md) và [Hướng dẫn cho lái xe](huong-dan-tai-xe.md).
>
> Bản này viết theo cách làm dựa trên **chuyến**, trước khi có Đơn hàng → Vòng xe → Chặng. Việc
> mới bắt đầu ở **Đơn hàng & vòng chạy** (tạo đơn, chọn điểm lấy/giao trên bản đồ); mục
> **Chuyến xe** nay nằm dưới "Cách làm trước đây" và chỉ để khép chuyến cũ. Danh mục và phần lái
> xe bên dưới đã được sửa theo màn hình hiện tại; các mục còn lại giữ nguyên để tra cứu.

Ba bản, mỗi bản khoảng 10–15 phút, đọc độc lập với nhau. Ai cũng bắt đầu bằng việc đăng nhập tại
địa chỉ được cấp; hệ thống mở đúng phần việc của vai được giao, không cần chọn gì thêm.

Thanh bên trái (đối chiếu màn hình ngày 24/09/2026):

- **Tổng quan**
- **Điều hành** — Đơn hàng & vòng chạy · Bảng điều hành · Điều xe · Đội xe & lái xe
- **Phải thu** — Kết thúc đơn · Phải thu khách hàng
- **Phải trả** — Phải trả đối tác & cây xăng · Nhiên liệu
- **Quỹ & lương lái xe** — Quỹ lái xe · Duyệt chi lái xe · Lương · Quyết toán lái xe
- **Tổng hợp & hiệu quả** — Tổng hợp tài chính · Hiệu quả từng chuyến · Tổng hợp giám đốc · Bảng
  đội xe · Báo cáo tuyến · Bản đồ vòng chạy · Xuất dữ liệu
- **Tài sản** — Bảo dưỡng & giấy tờ · Sở hữu tài sản
- **Cách làm trước đây** — Chuyến xe

Tên cũ còn gặp ở các mục dưới: _Công nợ & quyết toán_ nay là **Phải thu khách hàng**; _AR/AP_ nay
là **Phải trả đối tác & cây xăng**; _Biên trực tiếp_ nay là **Hiệu quả từng chuyến**; _Quỹ lái xe /
Chi phí_ nay là **Quỹ lái xe**.

Trên điện thoại, thanh bên thu lại thành nút **Danh mục** ở đầu màn hình.

---

## A. Giám đốc — 12 phút

Mục tiêu: sáng mở máy biết ngay hôm nay có gì phải xử lý, và biên trực tiếp tháng này ra sao.

### 1. Tổng quan (2 phút)

Đây là màn hình mặc định. Bảy ô số ở trên: đơn đang mở, vòng chạy đang chạy, vòng chạy đã lên kế
hoạch, xe đang rỗi, xe đang bảo dưỡng, lái xe đang làm, kỳ đối soát đang mở.

Dưới đó là **danh sách việc đang chờ người xử lý**. Mỗi dòng là một chuyến kèm lý do nó nằm đấy
("chưa cho chạy", "đã giao, chờ chốt đối soát"). Bấm vào một dòng là sang thẳng chuyến đó.

Nếu không có gì phải làm, màn hình nói đúng thế — nó không nói "mọi thứ đều ổn", vì hai câu đó
khác nhau.

### 2. Chuyến xe (4 phút)

Danh sách toàn bộ chuyến. Lọc theo **trạng thái** và **loại chuyến**; ô tìm kiếm nhận mã chuyến,
điểm đi, điểm đến.

Ba loại chuyến, và sự khác nhau giữa chúng là nghiệp vụ chứ không phải nhãn:

| Loại               | Nghĩa                               | Hệ thống làm gì khác đi                                                                                            |
| ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Xe nhà tự chạy** | Xe và lái xe của công ty            | Có quỹ lái xe, có phiếu nhiên liệu, có chi phí chuyến                                                              |
| **Thuê xe ngoài**  | Giao cho nhà xe khác chạy           | **Không** có vận hành nội bộ. Khai phiếu nhiên liệu cho chuyến này bị hệ thống từ chối. Sinh khoản phải trả nhà xe |
| **Nhận chạy hộ**   | Đối tác giới thiệu đơn, xe nhà chạy | Có đủ vận hành nội bộ, **và** sinh hoa hồng phải trả đối tác                                                       |

Bấm **Lập chuyến** để tạo mới: mã chuyến, ngày, điểm đi/đến, khách hàng, giá cước, quãng đường.
Sau khi lập, phân công xe và lái xe, rồi chuyển trạng thái theo vòng đời
`Đã lên kế hoạch → Đang chạy → Đã giao → Đã đối soát`.

> **Chốt đối soát là một cánh cửa một chiều.** Chuyến đã đối soát không nhận thêm khoản chi nào —
> hệ thống từ chối, không ghi âm thầm. Hãy chốt khi đã đủ chứng từ.

Huỷ chuyến là một đường riêng, đòi lý do, và **chỉ Giám đốc làm được**. Không có chức năng xoá
chuyến: một chuyến đã tồn tại thì luôn đọc lại được, kèm lý do vì sao nó dừng.

### 3. Biên trực tiếp (3 phút)

Doanh thu trừ chi phí trực tiếp, cộng dồn cho toàn bộ chuyến và tách riêng cho từng chuyến.

Nhãn **"chưa gồm chi phí cố định"** có mặt ở mọi chỗ hiển thị biên, và nó không phải câu rào đón:
khấu hao xe, lương văn phòng, lãi vay không được phân bổ vào chuyến. Con số này trả lời "chuyến
này có đáng chạy không", không trả lời "công ty lãi bao nhiêu".

### 4. Cảnh báo (3 phút)

Mở **Bảo dưỡng & giấy tờ**. Ba loại cảnh báo nằm chung một bảng: giấy tờ đã hết hạn, giấy tờ sắp
hết hạn, xe đến hạn bảo dưỡng — kèm cả những xe **thiếu giấy tờ** mà lẽ ra phải có.

Xe có lệnh bảo dưỡng đang mở được hệ thống suy ra là **đang sửa** và hiện như vậy ở bảng đội xe —
trạng thái hiệu lực do hệ thống tính, không đặt tay được. Đây là **cảnh báo, không phải khoá**: điều
độ viên vẫn phân được chuyến cho xe đó nếu cần, và hệ thống ghi lại. Cái gì thật sự cấm điều xe đi là
một câu chưa có lời từ phía nghiệp vụ, nên chưa ai dựng cổng chặn.

---

## B. Kế toán — 15 phút

Mục tiêu: đối soát được cây xăng, kiểm được quỹ lái xe, lấy được số liệu ra Excel.

### 1. Quỹ lái xe / Chi phí (4 phút)

Chọn một lái xe. Màn hình hiện **số dư quỹ** kèm một câu nói rõ chiều: "Lái xe đang giữ tiền của
công ty" hoặc ngược lại — thay vì bắt người đọc tự luận dấu âm dương.

Bên dưới là sổ quỹ: từng bút toán, ngày, loại, số tiền, diễn giải, người ghi.

Ba nút ở đầu: **Tạm ứng**, **Hoàn quỹ**, **Điều chỉnh**.

> Tạm ứng **không bắt buộc gắn với chuyến nào**. Đưa lái xe 3 triệu đầu tuần là một việc có thật,
> và hệ thống không bắt bịa ra một chuyến để ghi nó.

Sửa một bút toán đã ghi thì dùng **Đảo** — hệ thống phát một bút toán ngược, giữ nguyên bút toán
cũ. Không có sửa tại chỗ và không có xoá. Đây là chủ ý: sổ tiền phải đọc lại được sau sáu tháng.

Câu ghi dưới số dư đáng đọc kỹ một lần:

> _Số dư quỹ và giá thành chuyến đối soát được với nhau nhưng không cộng vào cùng một tổng: một
> khoản chi từ quỹ để lại hai bản ghi — một dòng tiền và một dòng giá thành._

Nghĩa là: đừng cộng "tổng chi từ quỹ" với "tổng chi phí chuyến" rồi tưởng đó là tổng chi. Chúng
trả lời hai câu hỏi khác nhau.

### 2. Nhiên liệu — đối soát bảng kê cây xăng (7 phút)

Đây là phần việc nặng nhất trong tháng, nên làm theo đúng thứ tự:

1. **Xác thực phiếu** lái xe đã khai. Phiếu chưa xác thực không tham gia so khớp.
2. Chọn **cây xăng**, khoảng **từ ngày – đến ngày**, chọn tệp bảng kê, bấm **Xem trước**.
   Xem trước **không ghi gì** — chạy trước cho yên tâm là đúng cột, đúng ngày.
3. Bấm **Nhập bảng kê**. Hệ thống tạo một kỳ đối soát cho khoảng thời gian đó.
4. Chạy **so khớp**. Kết quả rơi vào ba nhóm:

   | Kết quả    | Nghĩa                                                                  | Việc phải làm                    |
   | ---------- | ---------------------------------------------------------------------- | -------------------------------- |
   | **Khớp**   | Một dòng bảng kê ứng đúng một phiếu                                    | Không phải làm gì                |
   | **Lệch**   | Dòng bảng kê không có phiếu đối ứng, hoặc số tiền vượt ngưỡng cho phép | Chọn cách xử lý và ghi lý do     |
   | **Mập mờ** | Một dòng ứng được với **nhiều** phiếu                                  | Chỉ đúng phiếu nào là phiếu đúng |

   Với nhóm mập mờ, hệ thống **không tự đoán**. Nó bắt chỉ rõ dòng nào ghép với phiếu nào — vì
   đoán sai ở đây là ghi sai tiền cho một cây xăng có thật.

5. Xử lý hết chênh lệch rồi **chốt kỳ**. Còn chênh lệch chưa xử lý thì hệ thống chặn chốt.

> Kỳ đã chốt vẫn **mở lại được** khi cây xăng gửi bảng kê bổ sung — nhưng chỉ Giám đốc mở được, và
> phải ghi lý do.

**Định dạng bảng kê:** CSV hoặc XLSX, ngăn cách bằng **dấu phẩy**, cột `Biển số, Ngày, Số lít,
Thành tiền, Số hóa đơn, Ghi chú`, ngày dạng `DD/MM/YYYY`. Mẫu có sẵn — xem
[`chuyen-sang-du-lieu-that.md`](chuyen-sang-du-lieu-that.md). Thiếu cột bắt buộc thì hệ thống báo
đúng tên cột đang thiếu, không báo lỗi chung chung.

### 3. Công nợ & quyết toán (2 phút)

Chọn ngày tính đến. Sáu ô ở trên: tổng còn nợ, trong đó quá hạn, trong hạn, quá hạn 1–30 ngày,
31–60 ngày, trên 60 ngày. Bảng dưới liệt kê từng chứng từ kèm hạn thanh toán và tuổi nợ.

Mở **AR/AP** để xem phía phải trả. Bốn dòng tiền phải trả được **giữ riêng, không cộng chung**:
cây xăng, nhà xe, hoa hồng nguồn đơn, và quỹ lái xe. Một đối tác có thể vừa là nhà xe vừa là nguồn
đơn — nên khoá phân biệt là **vai**, không phải tên đối tác.

### 4. Xuất dữ liệu (2 phút)

Mở **Xuất dữ liệu**. Các nhóm tải về dạng CSV, mở thẳng bằng Excel:

| Kết xuất                           | Cần chọn thêm |
| ---------------------------------- | ------------- |
| Danh sách chuyến                   | —             |
| Công nợ phải thu theo tuổi nợ      | —             |
| Công nợ phải trả theo dòng tiền    | —             |
| Sổ quỹ một lái xe                  | Chọn lái xe   |
| Đối soát nhiên liệu của một chuyến | Chọn chuyến   |
| Bảng lương của một kỳ              | Chọn kỳ lương |

Tệp xuất ra dùng **dấu chấm phẩy** ngăn cột và có dấu nhận diện UTF-8 ở đầu — mở bằng Excel bản
tiếng Việt là ra đúng cột, đúng dấu. Số để **thô** (`1150000`, không phải `1.150.000 ₫`) để còn
cộng và lọc được; ngày giữ dạng `YYYY-MM-DD` để Excel không tự đảo ngày/tháng.

---

## C. Lái xe — 8 phút

Mở trên điện thoại. Chín mục ở thanh dưới cùng: **Trang chủ · Nhận việc · Hiện trường · Chuyến ·
Nhiên liệu · Chi phí · Quỹ · Lịch sử · Phiếu lương**.

### Trang chủ

Thẻ **Việc được điều từ văn phòng**: mã vòng xe, chặng, tuyến, đơn, và việc kế tiếp phải bấm.
Văn phòng đã giao việc cho bạn — không cần vào Nhận việc để nhận lại. Nút **Mở Hiện trường** mở
màn bấm mốc: đã tới điểm lấy hàng, đang xếp hàng, rời điểm lấy hàng, đã đến nơi, khách đã nhận
hàng, chụp biên nhận giao hàng. Mốc là bằng chứng; văn phòng là người tiến chặng. Dưới thẻ là số
dư quỹ.

Bạn chỉ thấy **chuyến của chính bạn**. Không có giá cước, không có doanh thu — đó là chủ ý.

### Khai phiếu đổ dầu

Vào **Nhiên liệu**. Chọn cây xăng, nhập số lít, số tiền, số km trên đồng hồ, số hoá đơn nếu có,
bấm **Gửi phiếu**. Vòng xe và xe lấy theo việc được điều đang mở; gắn chặng là
không bắt buộc. Chọn **Thanh toán**: _Lái xe trả tiền mặt_ — khi kế toán duyệt, khoản này trừ vào
quỹ của bạn để công ty hoàn lại, không ghi nợ cây xăng; hoặc _Ghi nợ cây xăng_ — không đụng tới
quỹ của bạn, và **chưa** thành công nợ ngay: kế toán xác thực phiếu → đối soát với bảng kê của cây
xăng → đóng kỳ; đóng kỳ xong mới vào công nợ cây xăng.

Phiếu vừa gửi hiện ngay bên dưới ở trạng thái **Mới khai**. Bấm **Đính ảnh chứng từ** để chụp
biên lai — ảnh gắn vào đúng phiếu đó và kế toán xem được khi đối soát.

Kế toán có thể **từ chối** một phiếu; phiếu bị từ chối gửi lại được, không phải khai từ đầu.

### Ghi khoản chi

Vào **Chi phí**. Chọn chuyến (chỉ hiện chuyến bạn được phân công), chọn nhóm chi phí, nhập số
tiền, đính ảnh nếu có. **Hiện chỉ ghi được trên chuyến theo cách cũ** — việc theo vòng xe chưa ghi
khoản chi dọc đường được.

> Khoản chi này **trừ vào quỹ tạm ứng của chính bạn**. Màn hình nói rõ điều đó ngay trên biểu mẫu.

### Quỹ và phiếu lương

**Quỹ** hiện số dư và toàn bộ bút toán của riêng bạn. **Phiếu lương** chỉ hiện phiếu **đã được
công bố** — phiếu đang ở bản nháp không hiện, kể cả phiếu mang tên bạn.

> **Hạn chế hiện tại:** phần lương **theo chuyến** và **theo km** hiện **chưa tính** việc theo vòng
> xe — hệ thống chỉ đếm chuyến theo cách cũ. Nếu công ty trả lương theo chuyến hoặc km, kế toán cộng
> tay phần việc theo vòng xe.
